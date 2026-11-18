// Backtest harness that replays the *live* rules.
//
// Earlier versions scored a different strategy (RSI 3-day uptrend + EMA9/21 +
// MACD with 8%/3% exits), so its output never described what the scanners
// actually emit. This harness calls the same `liveRules` functions the
// scanners use and applies the same exit handling as `updatePerformance`:
//
//   - stop is checked before target inside a candle (conservative)
//   - exits fill at the stop/target price
//   - positions close at the latest close once the holding window expires
//   - returns are net of the configured cost model
//   - one position per symbol at a time, matching the signal dedupe

import { CandleWithIndicators } from '../types';
import {
    COST_MODEL,
    DEFAULT_MAX_HOLDING_DAYS,
    MAX_HOLDING_DAYS,
    RISK_LIMITS,
} from '../config/settings';
import { computePerformance } from '../utils/performanceMath';
import { validateTradeLevels } from '../utils/tradeLevels';
import {
    BULLISH_RULES,
    CROSSOVER_RULES,
    calculateBullishLevels,
    evaluateBullishEntry,
    evaluateCrossoverAt,
} from './liveRules';

export type BacktestStrategy = 'BULLISH_SCAN' | 'EMA_CROSSOVER_SCAN';
export type ExitReason = 'STOP' | 'TARGET' | 'MAX_HOLDING' | 'OPEN';

export interface AlignedTrade {
    symbol: string;
    strategy: BacktestStrategy;
    timeframe: string;
    direction: 'BUY' | 'SELL';
    entryDate: string;
    entry: number;
    stopLoss: number;
    target: number;
    exitDate: string | null;
    exitPrice: number | null;
    exitReason: ExitReason;
    holdingDays: number;
    barsHeld: number;
    grossPercent: number;
    netPercent: number;
}

export interface SymbolBacktest {
    symbol: string;
    trades: AlignedTrade[];
    entries: number;
    rejected: number;
    rejections: Record<string, number>;
}

export interface BacktestSummary {
    strategy: BacktestStrategy;
    timeframe: string;
    symbols: number;
    from: string | null;
    to: string | null;
    entries: number;
    rejected: number;
    rejectionReasons: Array<{ reason: string; count: number }>;
    trades: number;
    open: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgNetPercent: number | null;
    medianNetPercent: number | null;
    avgGrossPercent: number | null;
    totalNetPercent: number | null;
    expectancyPercent: number | null;
    profitFactor: number | null;
    best: AlignedTrade | null;
    worst: AlignedTrade | null;
    avgHoldingDays: number | null;
    exits: Record<ExitReason, number>;
    avgWinPercent: number | null;
    avgLossPercent: number | null;
    /** Equal-weight, compounding portfolio return across traded symbols. */
    portfolioReturnPercent: number | null;
    /** Peak-to-trough drawdown of that same equal-weight portfolio. */
    maxDrawdownPercent: number | null;
}

const MAX_TRADES_PER_SYMBOL = 200;

function dayDiff(from: string | Date, to: string | Date): number {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
}

function increment(map: Record<string, number>, key: string): void {
    map[key] = (map[key] ?? 0) + 1;
}

/**
 * Validation reasons embed the actual percentage, which would otherwise create
 * one bucket per rejected candidate. Collapse them into categories.
 */
export function bucketRejectionReason(reason?: string): string {
    if (!reason) return 'unknown';

    if (/stop loss must be below entry/i.test(reason)) {
        return 'stop above entry (price below invalidation)';
    }
    if (/stop loss must be above entry/i.test(reason)) {
        return 'stop below entry (price above invalidation)';
    }
    if (/target must be above entry|target must be below entry/i.test(reason)) {
        return 'target on wrong side of entry';
    }
    if (/stop distance .* above the .* maximum/i.test(reason)) {
        return 'stop wider than max';
    }
    if (/stop distance .* below the .* minimum/i.test(reason)) {
        return 'stop tighter than min';
    }
    if (/reward:risk .* below the .* minimum/i.test(reason)) {
        return 'reward:risk below minimum';
    }
    if (/risk must be greater than zero|missing or non-finite/i.test(reason)) {
        return 'invalid or zero risk';
    }

    return reason;
}

/**
 * Replays one symbol's indicator series under the live entry and exit rules.
 */
export function backtestSeries(
    symbol: string,
    rows: CandleWithIndicators[],
    strategy: BacktestStrategy,
    timeframe: string
): SymbolBacktest {
    const result: SymbolBacktest = {
        symbol,
        trades: [],
        entries: 0,
        rejected: 0,
        rejections: {},
    };

    const warmup =
        strategy === 'BULLISH_SCAN'
            ? BULLISH_RULES.MIN_DATA_POINTS
            : CROSSOVER_RULES.MIN_DATA_POINTS;

    if (rows.length <= warmup + 1) return result;

    const maxHolding =
        MAX_HOLDING_DAYS[strategy] ?? DEFAULT_MAX_HOLDING_DAYS;
    const riskLimits = {
        minRiskReward: RISK_LIMITS.minRiskReward,
        minStopPercent: RISK_LIMITS.minStopPercent,
        maxStopPercent: RISK_LIMITS.maxStopPercent,
    };

    // Index of the bar the current position is still occupying.
    let busyUntil = -1;

    for (let i = warmup; i < rows.length - 1; i++) {
        if (i <= busyUntil) continue;

        const bar = rows[i];
        let direction: 'BUY' | 'SELL' | null = null;
        let entry = 0;
        let stopLoss = 0;
        let target = 0;

        if (strategy === 'BULLISH_SCAN') {
            const prev = rows[i - 1];
            const prevPrev = rows[i - 2];
            if (!prev || !prevPrev) continue;

            const evaluation = evaluateBullishEntry({
                ema10: bar.ema10,
                ema20: bar.ema20,
                ema50: bar.ema50,
                prevEMA20: prev.ema20,
                prevEMA50: prev.ema50,
                rsi: bar.rsi,
                macdHistogram: bar.macdHistogram,
                lastClose: bar.close,
                prevClose: prev.close,
                prevPrevClose: prevPrev.close,
                volume: bar.volume,
                avgVolume20: bar.avgVolume20,
                obv: bar.obv,
                prevObv: prev.obv,
            });

            if (!evaluation.isBullish) continue;

            // The live scanner needs a valid stop/target before it alerts.
            const swingDays = Math.min(BULLISH_RULES.SWING_DAYS, i + 1);
            const window = rows.slice(i - swingDays + 1, i + 1);
            const swingLow = Math.min(...window.map(row => row.low));
            const swingHigh = Math.max(...window.map(row => row.high));

            if (bar.ema50 == null || bar.atr == null) continue;

            const levels = calculateBullishLevels(
                bar.close,
                swingLow,
                swingHigh,
                bar.ema50,
                bar.atr
            );

            const validation = validateTradeLevels(
                {
                    direction: 'BUY',
                    entry: bar.close,
                    stopLoss: levels.stopLoss,
                    target: levels.target,
                },
                riskLimits
            );

            if (!validation.valid) {
                result.rejected++;
                increment(
                    result.rejections,
                    bucketRejectionReason(validation.reason)
                );
                continue;
            }

            direction = 'BUY';
            entry = bar.close;
            stopLoss = levels.stopLoss;
            target = levels.target;
        } else {
            const evaluation = evaluateCrossoverAt(rows, i, riskLimits);

            if (evaluation.direction == null) {
                if (
                    evaluation.reason?.startsWith('levels rejected') &&
                    evaluation.levelValidation?.reason
                ) {
                    result.rejected++;
                    increment(
                        result.rejections,
                        bucketRejectionReason(evaluation.levelValidation.reason)
                    );
                }
                continue;
            }

            direction = evaluation.direction;
            entry = evaluation.price!;
            stopLoss = evaluation.stopLoss!;
            target = evaluation.target!;
        }

        result.entries++;

        // Walk forward to the first bar that resolves the position.
        let exitIndex = -1;
        let exitPrice = 0;
        let exitReason: ExitReason = 'OPEN';
        let exitDate: string | null = null;

        for (let j = i + 1; j < rows.length; j++) {
            const candle = rows[j];

            // Same ordering as the live tracker: stop first, then target.
            if (direction === 'BUY') {
                if (candle.low <= stopLoss) {
                    exitIndex = j;
                    exitPrice = stopLoss;
                    exitReason = 'STOP';
                    exitDate = candle.date;
                    break;
                }
                if (candle.high >= target) {
                    exitIndex = j;
                    exitPrice = target;
                    exitReason = 'TARGET';
                    exitDate = candle.date;
                    break;
                }
            } else {
                if (candle.high >= stopLoss) {
                    exitIndex = j;
                    exitPrice = stopLoss;
                    exitReason = 'STOP';
                    exitDate = candle.date;
                    break;
                }
                if (candle.low <= target) {
                    exitIndex = j;
                    exitPrice = target;
                    exitReason = 'TARGET';
                    exitDate = candle.date;
                    break;
                }
            }

            // The live tracker closes anything past its holding window at the
            // latest close, after checking that candle for a stop/target hit.
            const elapsed = dayDiff(bar.date, candle.date);
            if (elapsed > maxHolding) {
                exitIndex = j;
                exitPrice = candle.close;
                exitReason = 'MAX_HOLDING';
                exitDate = candle.date;
                break;
            }
        }

        if (exitIndex < 0) {
            const last = rows[rows.length - 1];
            exitIndex = rows.length - 1;
            exitPrice = last.close;
            exitReason = 'OPEN';
            exitDate = last.date;
            // Do not open another position while one is still unresolved.
            busyUntil = rows.length;
        } else {
            busyUntil = exitIndex;
        }

        const performance = computePerformance(
            direction,
            entry,
            exitPrice,
            COST_MODEL
        );

        result.trades.push({
            symbol,
            strategy,
            timeframe,
            direction,
            entryDate: bar.date,
            entry,
            stopLoss,
            target,
            exitDate,
            exitPrice,
            exitReason,
            holdingDays: dayDiff(bar.date, exitDate ?? bar.date),
            barsHeld: exitIndex - i,
            grossPercent: performance.grossPercent,
            netPercent: performance.netPercent,
        });

        if (result.trades.length >= MAX_TRADES_PER_SYMBOL) break;
    }

    return result;
}

function percentile(values: number[], p: number): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.round((p / 100) * (sorted.length - 1)))
    );
    return sorted[index];
}

/**
 * Aggregate per-symbol results. Open trades are reported separately so they
 * cannot flatter the win rate.
 */
export function summarise(
    runs: SymbolBacktest[],
    strategy: BacktestStrategy,
    timeframe: string
): BacktestSummary {
    const closed: AlignedTrade[] = [];
    const open: AlignedTrade[] = [];
    let entries = 0;
    let rejected = 0;
    const rejectionReasons = new Map<string, number>();

    for (const run of runs) {
        entries += run.entries;
        rejected += run.rejected;
        for (const [reason, count] of Object.entries(run.rejections)) {
            rejectionReasons.set(
                reason,
                (rejectionReasons.get(reason) ?? 0) + count
            );
        }
        for (const trade of run.trades) {
            if (trade.exitReason === 'OPEN') open.push(trade);
            else closed.push(trade);
        }
    }

    closed.sort(
        (a, b) =>
            new Date(a.exitDate ?? 0).getTime() -
            new Date(b.exitDate ?? 0).getTime()
    );

    const nets = closed.map(trade => trade.netPercent);
    const gross = closed.map(trade => trade.grossPercent);
    const wins = nets.filter(value => value > 0);
    const losses = nets.filter(value => value <= 0);
    const gains = wins.reduce((total, value) => total + value, 0);
    const drawdowns = Math.abs(losses.reduce((total, value) => total + value, 0));

    // Equal-weight portfolio: every traded symbol starts with one unit of
    // capital and compounds its own trades. Portfolio value is the mean of the
    // symbol equities after each close. Summing percentages instead would
    // overstate both return and drawdown by the number of symbols.
    const tradedSymbols = [...new Set(closed.map(trade => trade.symbol))];
    const symbolEquity = new Map<string, number>();
    for (const symbol of tradedSymbols) symbolEquity.set(symbol, 1);

    let portfolio = 1;
    let peak = 1;
    let maxDrawdown = 0;

    for (const trade of closed) {
        const previous = symbolEquity.get(trade.symbol) ?? 1;
        symbolEquity.set(trade.symbol, previous * (1 + trade.netPercent / 100));

        let total = 0;
        for (const value of symbolEquity.values()) total += value;
        portfolio = tradedSymbols.length ? total / tradedSymbols.length : 1;

        peak = Math.max(peak, portfolio);
        maxDrawdown = Math.min(
            maxDrawdown,
            ((portfolio - peak) / peak) * 100
        );
    }

    const sortedByNet = [...closed].sort((a, b) => b.netPercent - a.netPercent);

    const dates = runs
        .flatMap(run => run.trades)
        .map(trade => new Date(trade.entryDate).getTime())
        .filter(value => Number.isFinite(value));

    return {
        strategy,
        timeframe,
        symbols: runs.length,
        from: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
        to: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
        entries,
        rejected,
        rejectionReasons: [...rejectionReasons.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count),
        trades: closed.length,
        open: open.length,
        wins: wins.length,
        losses: losses.length,
        winRate: nets.length ? (wins.length / nets.length) * 100 : null,
        avgNetPercent: nets.length
            ? nets.reduce((total, value) => total + value, 0) / nets.length
            : null,
        medianNetPercent: percentile(nets, 50),
        avgGrossPercent: gross.length
            ? gross.reduce((total, value) => total + value, 0) / gross.length
            : null,
        totalNetPercent: nets.length
            ? nets.reduce((total, value) => total + value, 0)
            : null,
        expectancyPercent: nets.length
            ? nets.reduce((total, value) => total + value, 0) / nets.length
            : null,
        profitFactor: drawdowns > 0 ? gains / drawdowns : null,
        best: sortedByNet[0] ?? null,
        worst: sortedByNet[sortedByNet.length - 1] ?? null,
        avgHoldingDays: closed.length
            ? closed.reduce((total, trade) => total + trade.holdingDays, 0) /
              closed.length
            : null,
        exits: {
            STOP: closed.filter(trade => trade.exitReason === 'STOP').length,
            TARGET: closed.filter(trade => trade.exitReason === 'TARGET').length,
            MAX_HOLDING: closed.filter(
                trade => trade.exitReason === 'MAX_HOLDING'
            ).length,
            OPEN: open.length,
        },
        avgWinPercent: wins.length
            ? wins.reduce((total, value) => total + value, 0) / wins.length
            : null,
        avgLossPercent: losses.length
            ? losses.reduce((total, value) => total + value, 0) / losses.length
            : null,
        portfolioReturnPercent: tradedSymbols.length
            ? (portfolio - 1) * 100
            : null,
        maxDrawdownPercent: tradedSymbols.length ? maxDrawdown : null,
    };
}
