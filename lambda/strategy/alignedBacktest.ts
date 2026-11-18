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

export type BacktestStrategy =
    | 'ETF_BULLISH_SCAN'
    | 'BULLISH_SCAN'
    | 'EMA_CROSSOVER_SCAN';
export type ExitReason = 'STOP' | 'TARGET' | 'MAX_HOLDING' | 'OPEN';

export interface AlignedTrade {
    symbol: string;
    strategy: BacktestStrategy;
    timeframe: string;
    direction: 'BUY' | 'SELL';
    /** Candle the signal was computed from. */
    signalDate: string;
    /** Candle/price at which the position is assumed to be opened. */
    entryDate: string;
    entryModel: 'signal_close' | 'next_open';
    entry: number;
    entryRiskReward: number;
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

export interface BacktestOverrides {
    /** Reward multiple used for the bullish ATR target (default 2R). */
    targetRMultiple?: number;
    /** Floor applied to the swing-high target (default 1.05). */
    swingHighBuffer?: number;
    /** Override the per-strategy holding window in calendar days. */
    maxHoldingDays?: number;
    minRiskReward?: number;
    minStopPercent?: number;
    maxStopPercent?: number;
    /** Entry-side experiments. */
    bullishThreshold?: number;
    bullishRsiMin?: number;
    bullishRsiMax?: number;
    /** Skip entries when ADX is below this value. */
    minAdx?: number;
    /** Restrict entries to an ISO date window (inclusive). */
    entryFrom?: string;
    entryTo?: string;
    /**
     * signal_close: enter at the signal candle's close (old model).
     * next_open:    enter at the next session's open (executable model).
     */
    entryModel?: 'signal_close' | 'next_open';
    /**
     * Reward:risk floor applied at the executable entry. The 1.5 screen runs
     * at signal time; after a gap the fill can be worse, so the floor here is
     * lower. 1.0 means "reward must still exceed risk".
     */
    entryMinRiskReward?: number;
    /** Only take entries when the benchmark regime is bullish on that date. */
    requireBullishRegime?: boolean;
    /** Date (YYYY-MM-DD) -> benchmark is bullish. Supplied by the caller. */
    regimeByDate?: Map<string, boolean>;
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
    maxConsecutiveLosses: number;
    /** Fills where the gap pushed reward:risk below the 1.5 screen. */
    entryRrDegraded: number;
    avgEntryRiskReward: number | null;
    yearly: Array<{
        year: number;
        trades: number;
        wins: number;
        winRate: number | null;
        avgNetPercent: number | null;
        totalNetPercent: number | null;
    }>;
    /** Equal-weight, compounding portfolio return across traded symbols. */
    portfolioReturnPercent: number | null;
    /** Peak-to-trough drawdown of that same equal-weight portfolio. */
    maxDrawdownPercent: number | null;
}

const MAX_TRADES_PER_SYMBOL = 200;

/**
 * Yahoo occasionally returns a few bars at a different price scale (an
 * unadjusted split, or a provider glitch). Indicators computed across that
 * jump are meaningless and a position can appear to lose 90% in a day.
 *
 * Detect any close-to-close move beyond `thresholdPercent` and drop everything
 * up to and including the last one, so the backtest only sees a consistent
 * series. The caller must recompute indicators afterwards.
 */
export function truncateAtDataGlitches<T extends { date: string; close: number }>(
    candles: T[],
    thresholdPercent = 35
): { rows: T[]; droppedBars: number; lastGlitch: string | null } {
    let last = -1;

    for (let i = 1; i < candles.length; i++) {
        const previous = candles[i - 1]?.close;
        const current = candles[i]?.close;
        if (!previous || !current) continue;
        const change = Math.abs((current - previous) / previous) * 100;
        if (change > thresholdPercent) last = i;
    }

    if (last < 0) {
        return { rows: candles, droppedBars: 0, lastGlitch: null };
    }

    return {
        rows: candles.slice(last),
        droppedBars: last,
        lastGlitch: candles[last].date,
    };
}

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
    timeframe: string,
    overrides: BacktestOverrides = {}
): SymbolBacktest {
    const result: SymbolBacktest = {
        symbol,
        trades: [],
        entries: 0,
        rejected: 0,
        rejections: {},
    };

    const warmup =
        strategy === 'BULLISH_SCAN' || strategy === 'ETF_BULLISH_SCAN'
            ? BULLISH_RULES.MIN_DATA_POINTS
            : CROSSOVER_RULES.MIN_DATA_POINTS;

    if (rows.length <= warmup + 1) return result;

    const maxHolding =
        overrides.maxHoldingDays ??
        MAX_HOLDING_DAYS[strategy] ??
        DEFAULT_MAX_HOLDING_DAYS;
    const riskLimits = {
        minRiskReward: overrides.minRiskReward ?? RISK_LIMITS.minRiskReward,
        minStopPercent: overrides.minStopPercent ?? RISK_LIMITS.minStopPercent,
        maxStopPercent: overrides.maxStopPercent ?? RISK_LIMITS.maxStopPercent,
    };

    // Index of the bar the current position is still occupying.
    let busyUntil = -1;

    for (let i = warmup; i < rows.length - 1; i++) {
        if (i <= busyUntil) continue;

        const bar = rows[i];

        if (overrides.entryFrom && bar.date < overrides.entryFrom) continue;
        if (overrides.entryTo && bar.date > overrides.entryTo) continue;

        if (overrides.requireBullishRegime) {
            const dayKey = bar.date.slice(0, 10);
            if (overrides.regimeByDate?.get(dayKey) !== true) continue;
        }
        let direction: 'BUY' | 'SELL' | null = null;
        let entry = 0;
        let stopLoss = 0;
        let target = 0;

        if (strategy === 'BULLISH_SCAN' || strategy === 'ETF_BULLISH_SCAN') {
            const prev = rows[i - 1];
            const prevPrev = rows[i - 2];
            if (!prev || !prevPrev) continue;

            const evaluation = evaluateBullishEntry(
                {
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
                },
                {
                    threshold: overrides.bullishThreshold,
                    rsiMin: overrides.bullishRsiMin,
                    rsiMax: overrides.bullishRsiMax,
                }
            );

            if (!evaluation.isBullish) continue;

            // Optional trend-strength gate used by entry experiments.
            if (
                overrides.minAdx != null &&
                (bar.adx == null || bar.adx < overrides.minAdx)
            ) {
                continue;
            }

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
                bar.atr,
                {
                    targetRMultiple: overrides.targetRMultiple,
                    swingHighBuffer: overrides.swingHighBuffer,
                }
            );

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

        // --- Entry execution model -------------------------------------
        // signal_close is the old (optimistic) model: the alert price is the
        // close of the signal candle. next_open is what a reader can actually
        // pay: the open of the following session. Levels stay absolute; only
        // the distances and reward:risk are recomputed against the fill.
        const entryModel = overrides.entryModel ?? 'next_open';
        let entryIndex = i;
        let entryPrice = entry;

        if (entryModel === 'next_open') {
            if (i + 1 >= rows.length) continue;
            entryIndex = i + 1;
            entryPrice = rows[entryIndex].open;
        }

        const executable = validateTradeLevels(
            { direction, entry: entryPrice, stopLoss, target },
            {
                ...riskLimits,
                minRiskReward:
                    overrides.entryMinRiskReward ?? 1.0,
            }
        );

        if (!executable.valid) {
            result.rejected++;
            increment(
                result.rejections,
                entryModel === 'next_open'
                    ? `entry invalid after gap (${bucketRejectionReason(
                          executable.reason
                      )})`
                    : bucketRejectionReason(executable.reason)
            );
            continue;
        }

        entry = entryPrice;
        const signalDate = bar.date;
        const entryDate = rows[entryIndex].date;
        const entryRiskReward =
            Math.abs(target - entry) / Math.abs(entry - stopLoss);

        result.entries++;

        // Walk forward to the first bar that resolves the position.
        let exitIndex = -1;
        let exitPrice = 0;
        let exitReason: ExitReason = 'OPEN';
        let exitDate: string | null = null;

        const scanStart = entryModel === 'next_open' ? entryIndex : i + 1;

        for (let j = scanStart; j < rows.length; j++) {
            const candle = rows[j];

            // Stop first, then target. A bar that opens beyond the stop is
            // filled at the open, not at the stop price, so a gap cannot be
            // recorded as a clean stop-out.
            if (direction === 'BUY') {
                if (candle.open <= stopLoss) {
                    exitIndex = j;
                    exitPrice = candle.open;
                    exitReason = 'STOP';
                    exitDate = candle.date;
                    break;
                }
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
                if (candle.open >= stopLoss) {
                    exitIndex = j;
                    exitPrice = candle.open;
                    exitReason = 'STOP';
                    exitDate = candle.date;
                    break;
                }
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
            const elapsed = dayDiff(entryDate, candle.date);
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
            signalDate,
            entryDate,
            entryModel,
            entry,
            entryRiskReward,
            stopLoss,
            target,
            exitDate,
            exitPrice,
            exitReason,
            holdingDays: dayDiff(entryDate, exitDate ?? entryDate),
            barsHeld: exitIndex - entryIndex,
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

    const entryRr = closed
        .map(trade => trade.entryRiskReward)
        .filter(value => Number.isFinite(value));
    const entryRrDegraded = entryRr.filter(value => value < 1.5).length;

    let maxConsecutiveLosses = 0;
    let currentLossStreak = 0;
    for (const trade of closed) {
        if (trade.netPercent <= 0) {
            currentLossStreak++;
            maxConsecutiveLosses = Math.max(
                maxConsecutiveLosses,
                currentLossStreak
            );
        } else {
            currentLossStreak = 0;
        }
    }

    const yearMap = new Map<
        number,
        { nets: number[]; wins: number }
    >();
    for (const trade of closed) {
        const year = new Date(trade.exitDate ?? trade.entryDate).getUTCFullYear();
        const bucket = yearMap.get(year) ?? { nets: [], wins: 0 };
        bucket.nets.push(trade.netPercent);
        if (trade.netPercent > 0) bucket.wins++;
        yearMap.set(year, bucket);
    }

    const yearly = [...yearMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, bucket]) => ({
            year,
            trades: bucket.nets.length,
            wins: bucket.wins,
            winRate:
                bucket.nets.length > 0
                    ? (bucket.wins / bucket.nets.length) * 100
                    : null,
            avgNetPercent:
                bucket.nets.length > 0
                    ? bucket.nets.reduce((total, value) => total + value, 0) /
                      bucket.nets.length
                    : null,
            totalNetPercent:
                bucket.nets.length > 0
                    ? bucket.nets.reduce((total, value) => total + value, 0)
                    : null,
        }));

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
        maxConsecutiveLosses,
        entryRrDegraded,
        avgEntryRiskReward: entryRr.length
            ? entryRr.reduce((total, value) => total + value, 0) / entryRr.length
            : null,
        yearly,
        portfolioReturnPercent: tradedSymbols.length
            ? (portfolio - 1) * 100
            : null,
        maxDrawdownPercent: tradedSymbols.length ? maxDrawdown : null,
    };
}
