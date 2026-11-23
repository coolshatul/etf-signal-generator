// Portfolio-level replay: concurrent slots, combined open risk, deployed
// capital and exposure-group caps, all sized from a fixed risk per trade.
//
// The per-symbol backtest answers "does this signal work". This answers "what
// happens if you hold the whole book", which is the question that matters once
// several correlated ETFs signal on the same morning.

import { CandleWithIndicators } from '../types';
import { MAX_HOLDING_DAYS, DEFAULT_MAX_HOLDING_DAYS, RISK_LIMITS } from '../config/settings';
import { COST_MODEL } from '../config/settings';
import { validateTradeLevels, maxValidEntry } from '../utils/tradeLevels';
import { etfExposureGroup } from '../utils/common';
import {
    BULLISH_RULES,
    calculateBullishLevels,
    evaluateBullishEntry,
} from './liveRules';

export interface PortfolioConfig {
    /** Starting equity. */
    initialCapital: number;
    /** Fraction of current equity risked per trade, e.g. 0.005. */
    riskPerTrade: number;
    /** Maximum simultaneous positions. */
    maxConcurrent: number;
    /** Maximum summed open risk as a fraction of equity, e.g. 0.02. */
    maxCombinedRisk: number;
    /** Maximum invested capital as a fraction of equity. */
    maxDeployed: number;
    /** Maximum positions in one exposure group (undefined = unlimited). */
    maxPerGroup?: number;
    /** Minimum reward:risk at the fill. */
    entryMinRiskReward: number;
    /** Max holding from the entry date. */
    maxHoldingDays?: number;
}

export interface PortfolioTrade {
    symbol: string;
    group: string;
    entryDate: string;
    exitDate: string;
    entry: number;
    exit: number;
    stopLoss: number;
    target: number;
    quantity: number;
    riskAmount: number;
    pnl: number;
    returnPercent: number;
    exitReason: 'STOP' | 'TARGET' | 'MAX_HOLDING' | 'OPEN';
    holdingDays: number;
}

export interface PortfolioResult {
    trades: PortfolioTrade[];
    open: number;
    finalEquity: number;
    totalReturnPercent: number;
    cagrPercent: number;
    maxDrawdownPercent: number;
    avgConcurrent: number;
    maxConcurrent: number;
    avgDeployedPercent: number;
    winRate: number | null;
    avgTradePercent: number | null;
    profitFactor: number | null;
    rejections: Record<string, number>;
    from: string | null;
    to: string | null;
}

interface Candidate {
    symbol: string;
    group: string;
    entryDate: string;
    maxEntry: number;
    stopLoss: number;
    target: number;
    entryRiskReward: number;
    stopPercent: number;
}

interface Position {
    symbol: string;
    group: string;
    entryDate: string;
    entry: number;
    stopLoss: number;
    target: number;
    quantity: number;
    costBasis: number;
    riskAmount: number;
}


function roundTripCost(): number {
    return (
        COST_MODEL.roundTripCostPercent +
        (COST_MODEL.slippageBpsPerSide / 100) * 2
    );
}

function dayDiff(from: string, to: string): number {
    return Math.max(
        0,
        Math.round(
            (new Date(to).getTime() - new Date(from).getTime()) / 86400000
        )
    );
}

function generateCandidates(
    symbol: string,
    rows: CandleWithIndicators[],
    config: PortfolioConfig
): Candidate[] {
    const candidates: Candidate[] = [];
    const group = etfExposureGroup(symbol);
    const warmup = BULLISH_RULES.MIN_DATA_POINTS;
    const riskLimits = {
        minRiskReward: RISK_LIMITS.minRiskReward,
        minStopPercent: RISK_LIMITS.minStopPercent,
        maxStopPercent: RISK_LIMITS.maxStopPercent,
    };

    for (let i = warmup; i < rows.length - 1; i++) {
        const bar = rows[i];
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

        if (!validation.valid) continue;

        candidates.push({
            symbol,
            group,
            entryDate: rows[i + 1].date,
            maxEntry: maxValidEntry(levels.stopLoss, levels.target),
            stopLoss: levels.stopLoss,
            target: levels.target,
            entryRiskReward: validation.riskRewardRatio,
            stopPercent: -levels.stopLossPercent,
        });
    }

    return candidates;
}

export function runPortfolio(
    series: Map<string, CandleWithIndicators[]>,
    config: PortfolioConfig
): PortfolioResult {
    const maxHolding =
        config.maxHoldingDays ??
        MAX_HOLDING_DAYS.ETF_BULLISH_SCAN ??
        DEFAULT_MAX_HOLDING_DAYS;

    // Daily bars per symbol, keyed by the exact candle timestamp.
    const bars = new Map<string, Map<string, CandleWithIndicators>>();
    const candidatesByDate = new Map<string, Candidate[]>();
    const dates = new Set<string>();

    for (const [symbol, rows] of series) {
        const byDate = new Map<string, CandleWithIndicators>();
        for (const row of rows) {
            byDate.set(row.date, row);
            dates.add(row.date);
        }
        bars.set(symbol, byDate);

        for (const candidate of generateCandidates(symbol, rows, config)) {
            const list = candidatesByDate.get(candidate.entryDate) ?? [];
            list.push(candidate);
            candidatesByDate.set(candidate.entryDate, list);
        }
    }

    const sortedDates = [...dates].sort();
    const firstDate = sortedDates[0] ?? null;
    const lastDate = sortedDates[sortedDates.length - 1] ?? null;

    let equity = config.initialCapital;
    let cash = config.initialCapital;
    let peak = equity;
    let maxDrawdown = 0;
    let concurrentSum = 0;
    let dateCount = 0;
    let concurrentMax = 0;
    let deployedSum = 0;

    const positions: Position[] = [];
    const trades: PortfolioTrade[] = [];
    const rejections: Record<string, number> = {};

    const reject = (reason: string) => {
        rejections[reason] = (rejections[reason] ?? 0) + 1;
    };

    for (const date of sortedDates) {
        // --- Exits first -------------------------------------------------
        for (let p = positions.length - 1; p >= 0; p--) {
            const position = positions[p];
            const candle = bars.get(position.symbol)?.get(date);
            if (!candle) continue;

            let exitPrice: number | null = null;
            let reason: PortfolioTrade['exitReason'] = 'OPEN';

            if (candle.open <= position.stopLoss) {
                exitPrice = candle.open;
                reason = 'STOP';
            } else if (candle.low <= position.stopLoss) {
                exitPrice = position.stopLoss;
                reason = 'STOP';
            } else if (candle.high >= position.target) {
                exitPrice = position.target;
                reason = 'TARGET';
            } else if (
                dayDiff(position.entryDate, date) > maxHolding
            ) {
                exitPrice = candle.close;
                reason = 'MAX_HOLDING';
            }

            if (exitPrice == null) continue;

            const proceeds = position.quantity * exitPrice;
            const cost = position.costBasis * (roundTripCost() / 100);
            cash += proceeds - cost;
            positions.splice(p, 1);

            const pnl = proceeds - cost - position.costBasis;
            trades.push({
                symbol: position.symbol,
                group: position.group,
                entryDate: position.entryDate,
                exitDate: date,
                entry: position.entry,
                exit: exitPrice,
                stopLoss: position.stopLoss,
                target: position.target,
                quantity: position.quantity,
                riskAmount: position.riskAmount,
                pnl,
                returnPercent: (pnl / position.costBasis) * 100,
                exitReason: reason,
                holdingDays: dayDiff(position.entryDate, date),
            });
        }

        // --- Entries -----------------------------------------------------
        const candidates = (candidatesByDate.get(date) ?? [])
            .map(candidate => {
                const candle = bars.get(candidate.symbol)?.get(date);
                return { candidate, candle };
            })
            .filter((item): item is { candidate: Candidate; candle: CandleWithIndicators } =>
                Boolean(item.candle)
            )
            .map(({ candidate, candle }) => {
                const fill = candle.open;
                const risk = fill - candidate.stopLoss;
                return {
                    candidate,
                    fill,
                    risk,
                    rr: risk > 0 ? (candidate.target - fill) / risk : 0,
                };
            })
            .filter(item => {
                if (item.fill > item.candidate.maxEntry) {
                    reject('entry above ceiling');
                    return false;
                }
                if (item.rr < config.entryMinRiskReward) {
                    reject('fill below reward floor');
                    return false;
                }
                return true;
            })
            .sort((a, b) => b.rr - a.rr);

        // Current equity for sizing and caps, including open marks.
        let markValue = 0;
        for (const position of positions) {
            const candle = bars.get(position.symbol)?.get(date);
            markValue += position.quantity * (candle?.close ?? position.entry);
        }
        equity = cash + markValue;

        for (const item of candidates) {
            if (positions.some(position => position.symbol === item.candidate.symbol)) {
                reject('symbol already open');
                continue;
            }
            if (positions.length >= config.maxConcurrent) {
                reject('no free slot');
                continue;
            }
            if (config.maxPerGroup) {
                const inGroup = positions.filter(
                    position => position.group === item.candidate.group
                ).length;
                if (inGroup >= config.maxPerGroup) {
                    reject(`group cap (${item.candidate.group})`);
                    continue;
                }
            }

            const openRisk = positions.reduce(
                (total, position) => total + position.riskAmount,
                0
            );
            const riskAmount = equity * config.riskPerTrade;

            if (
                (openRisk + riskAmount) / equity >
                config.maxCombinedRisk
            ) {
                reject('combined risk cap');
                continue;
            }

            const quantity = riskAmount / item.risk;
            const costBasis = quantity * item.fill;

            const deployed = positions.reduce(
                (total, position) => total + position.costBasis,
                0
            );
            if (
                (deployed + costBasis) / equity >
                config.maxDeployed ||
                costBasis > cash
            ) {
                reject('capital cap');
                continue;
            }

            cash -= costBasis;
            positions.push({
                symbol: item.candidate.symbol,
                group: item.candidate.group,
                entryDate: date,
                entry: item.fill,
                stopLoss: item.candidate.stopLoss,
                target: item.candidate.target,
                quantity,
                costBasis,
                riskAmount,
            });
        }

        // --- Mark to market ---------------------------------------------
        let value = 0;
        for (const position of positions) {
            const candle = bars.get(position.symbol)?.get(date);
            value += position.quantity * (candle?.close ?? position.entry);
        }
        equity = cash + value;
        peak = Math.max(peak, equity);
        maxDrawdown = Math.min(
            maxDrawdown,
            ((equity - peak) / peak) * 100
        );

        const invested = positions.reduce(
            (total, position) => total + position.quantity * position.entry,
            0
        );
        concurrentSum += positions.length;
        concurrentMax = Math.max(concurrentMax, positions.length);
        deployedSum += equity > 0 ? (invested / equity) * 100 : 0;
        dateCount++;
    }

    // Close what is still open at the last close.
    for (const position of positions) {
        const lastBar = series.get(position.symbol)?.slice(-1)[0];
        if (!lastBar) continue;
        const proceeds = position.quantity * lastBar.close;
        const cost = position.costBasis * (roundTripCost() / 100);
        const pnl = proceeds - cost - position.costBasis;
        cash += proceeds - cost;
        trades.push({
            symbol: position.symbol,
            group: position.group,
            entryDate: position.entryDate,
            exitDate: lastBar.date,
            entry: position.entry,
            exit: lastBar.close,
            stopLoss: position.stopLoss,
            target: position.target,
            quantity: position.quantity,
            riskAmount: position.riskAmount,
            pnl,
            returnPercent: (pnl / position.costBasis) * 100,
            exitReason: 'OPEN',
            holdingDays: dayDiff(position.entryDate, lastBar.date),
        });
    }

    const closed = trades.filter(trade => trade.exitReason !== 'OPEN');
    const wins = closed.filter(trade => trade.pnl > 0);
    const losses = closed.filter(trade => trade.pnl <= 0);
    const gains = wins.reduce((total, trade) => total + trade.pnl, 0);
    const lossesTotal = Math.abs(
        losses.reduce((total, trade) => total + trade.pnl, 0)
    );

    const finalEquity = cash + 0; // all positions closed above
    const years =
        firstDate && lastDate
            ? (new Date(lastDate).getTime() - new Date(firstDate).getTime()) /
              (365.25 * 86400000)
            : 0;

    return {
        trades,
        open: trades.filter(trade => trade.exitReason === 'OPEN').length,
        finalEquity,
        totalReturnPercent:
            ((finalEquity - config.initialCapital) / config.initialCapital) *
            100,
        cagrPercent:
            years > 0
                ? (Math.pow(finalEquity / config.initialCapital, 1 / years) - 1) *
                  100
                : 0,
        maxDrawdownPercent: maxDrawdown,
        avgConcurrent: dateCount ? concurrentSum / dateCount : 0,
        maxConcurrent: concurrentMax,
        avgDeployedPercent: dateCount ? deployedSum / dateCount : 0,
        winRate: closed.length
            ? (wins.length / closed.length) * 100
            : null,
        avgTradePercent: closed.length
            ? closed.reduce((total, trade) => total + trade.returnPercent, 0) /
              closed.length
            : null,
        profitFactor: lossesTotal > 0 ? gains / lossesTotal : null,
        rejections,
        from: firstDate,
        to: lastDate,
    };
}
