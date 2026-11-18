import { connectToDatabase } from './connection';
import { Signal } from './models';
import {
    BullishStockResult,
    EMA36Result,
    EMACrossoverResult,
    ExitReason,
    SignalDirection,
    SignalTimeframe,
} from '../types';
import { fetchHistoricalData, fetchCorporateActions } from '../utils/fetchData';
import { processWithConcurrency } from '../utils/common';
import {
    buildSignalKey,
    resolveEntryAt,
    signalSessionDate,
    SIGNAL_STRATEGIES,
} from '../utils/signalIdentity';
import {
    COST_MODEL,
    MAX_HOLDING_DAYS,
    DEFAULT_MAX_HOLDING_DAYS,
    RISK_LIMITS,
} from '../config/settings';
import {
    adjustLevelsForSplits,
    computePerformance,
    cumulativeSplitRatio,
    detectUnexplainedGap,
    isWithinHoldingWindow,
    SplitEvent,
} from '../utils/performanceMath';

export type { SignalDirection };

export interface SignalFilterOptions<T> {
    signalFor?: (result: T) => SignalDirection;
    keyFor?: (result: T, direction: SignalDirection) => string;
    timeframe: SignalTimeframe;
    /** Cooldown in milliseconds. Takes precedence over cooldownDays. */
    cooldownMs?: number;
    /** Backwards-compatible cooldown in days. */
    cooldownDays?: number;
    /** 'block' suppresses alerts when the dedupe lookup fails. */
    failMode?: 'block' | 'allow';
}

export interface FilteredSignals<T> {
    fresh: T[];
    dedupeVerified: boolean;
}

function directionKey(symbol: string, direction: SignalDirection): string {
    return `${symbol.trim().toUpperCase()}:${direction}`;
}

function daysBetween(from: Date, to: Date): number {
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

export function normalizeTimeframe(
    timeframe: SignalTimeframe | undefined,
    strategy: string
): SignalTimeframe {
    if (timeframe) return timeframe;
    if (strategy === SIGNAL_STRATEGIES.emaCrossover) return '15m';
    if (
        strategy === SIGNAL_STRATEGIES.weeklyPullback ||
        strategy === SIGNAL_STRATEGIES.legacyEMA36
    ) {
        return '1wk';
    }
    return '1d';
}

/**
 * Calendar-day lookback needed to cover the oldest open signal in a group.
 * Intraday requests are calendar days too, so weekends/holidays are covered.
 */
function lookbackFor(timeframe: SignalTimeframe, ageDays: number): number {
    switch (timeframe) {
        case '15m':
            return Math.min(20, Math.max(5, Math.ceil(ageDays) + 2));
        case '1h':
            return Math.min(40, Math.max(10, Math.ceil(ageDays) + 2));
        case '1wk':
            return Math.min(1095, Math.max(60, Math.ceil(ageDays / 7) + 5) * 7);
        default:
            return Math.min(120, Math.max(15, Math.ceil(ageDays) + 5));
    }
}

/**
 * Returns only results that are not already represented by an existing signal.
 *
 * Three layers:
 * 1. Immutable signalKey: the exact same candle/cross can never alert twice,
 *    even after it has been stopped out or targeted.
 * 2. Open position: a new session/cross for an already-open direction does not
 *    re-alert.
 * 3. Cooldown: prevents rapid direction flip-flops.
 *
 * On a database failure the default is to block alerts. Duplicates are worse
 * than a missed scan, and the failure is logged for monitoring.
 */
export async function filterNewSignals<T extends { symbol: string; asOf?: string }>(
    results: T[],
    strategy: string,
    options: SignalFilterOptions<T>
): Promise<FilteredSignals<T>> {
    if (!results.length) {
        return { fresh: [], dedupeVerified: true };
    }

    const signalFor = options.signalFor ?? (() => 'BUY' as const);
    const keyFor =
        options.keyFor ??
        ((result, direction) =>
            buildSignalKey({
                strategy,
                timeframe: options.timeframe,
                symbol: result.symbol,
                direction,
                eventAt: resolveEntryAt(result.asOf),
            }));

    const cooldownMs =
        options.cooldownMs ??
        (options.cooldownDays ? options.cooldownDays * 86400000 : 0);
    const failMode = options.failMode ?? 'block';

    try {
        await connectToDatabase();

        const symbols = [...new Set(results.map(r => r.symbol.trim().toUpperCase()))];
        const keys = results.map(result => keyFor(result, signalFor(result)));
        const openSince = new Date(
            Date.now() - RISK_LIMITS.maxOpenAgeDays * 86400000
        );
        const cooldownSince =
            cooldownMs > 0 ? new Date(Date.now() - cooldownMs) : null;

        const orConditions: any[] = [
            { signalKey: { $in: keys } },
            { status: 'OPEN', date: { $gte: openSince } },
        ];
        if (cooldownSince) {
            // Use entryAt, not the session `date`: the session date is midnight
            // IST and would make a 60-minute cooldown meaningless.
            orConditions.push({ entryAt: { $gte: cooldownSince } });
        }

        const existing = await Signal.find({
            strategy,
            symbol: { $in: symbols },
            $or: orConditions,
        })
            .select('signalKey symbol signal status date entryAt')
            .lean();

        const blockedKeys = new Set<string>();
        const blockedDirections = new Set<string>();

        for (const row of existing) {
            if (row.signalKey) blockedKeys.add(row.signalKey);

            const entryAt = row.entryAt ?? row.date;
            const inCooldown =
                cooldownSince != null &&
                new Date(entryAt).getTime() >= cooldownSince.getTime();

            if (row.status === 'OPEN' || inCooldown) {
                blockedDirections.add(
                    directionKey(row.symbol, row.signal as SignalDirection)
                );
            }
        }

        const fresh = results.filter(result => {
            const direction = signalFor(result);
            const key = keyFor(result, direction);
            if (blockedKeys.has(key)) return false;
            if (blockedDirections.has(directionKey(result.symbol, direction))) {
                return false;
            }
            return true;
        });

        console.log(
            `🔎 ${strategy}: ${results.length} candidates, ${fresh.length} new after dedupe`
        );

        return { fresh, dedupeVerified: true };
    } catch (err) {
        console.error('❌ Dedupe lookup failed:', err);

        if (failMode === 'allow') {
            console.warn(
                '⚠️ Sending unfiltered signals because dedupe could not be verified.'
            );
            return { fresh: results, dedupeVerified: false };
        }

        console.error(
            '⛔ Suppressing signals because dedupe could not be verified.'
        );
        return { fresh: [], dedupeVerified: false };
    }
}

/**
 * Logs bullish stock analysis results to MongoDB.
 */
export async function logBullishSignals(
    results: BullishStockResult[]
): Promise<void> {
    if (!results.length) return;

    try {
        await connectToDatabase();

        for (const result of results) {
            const entryAt = resolveEntryAt(result.asOf);
            const signalKey = buildSignalKey({
                strategy: SIGNAL_STRATEGIES.bullish,
                timeframe: '1d',
                symbol: result.symbol,
                direction: 'BUY',
                eventAt: entryAt,
            });

            const signal = {
                signalKey,
                symbol: result.symbol,
                date: signalSessionDate(entryAt),
                entryAt,
                timeframe: '1d' as SignalTimeframe,
                signal: 'BUY' as const,
                price: result.price,
                rating: result.rating,
                signals: result.signals,
                stopLoss: result.stopLoss,
                target: result.target,
                riskRewardRatio: result.riskRewardRatio,
                strategy: SIGNAL_STRATEGIES.bullish,
                status: 'OPEN' as const,
                metadata: {
                    swingLow: result.swingLow,
                    swingHigh: result.swingHigh,
                    stopLossPercent: result.stopLossPercent,
                    targetPercent: result.targetPercent,
                    marketRegimeBullish: result.marketRegimeBullish,
                    asOf: entryAt.toISOString(),
                },
            };

            await Signal.findOneAndUpdate({ signalKey }, signal, {
                upsert: true,
                new: true,
            });
        }

        console.log(`✅ Logged ${results.length} bullish signals to MongoDB.`);
    } catch (err) {
        console.error('❌ Error logging signals to MongoDB:', err);
    }
}

/**
 * Logs weekly pullback watchlist entries. These are explicitly NOT executable
 * BUY signals: status WATCHLIST, direction HOLD, no stop/target, and excluded
 * from BUY performance tracking.
 */
export async function logEMA36Signals(results: EMA36Result[]): Promise<void> {
    if (!results.length) return;

    try {
        await connectToDatabase();

        for (const result of results) {
            const entryAt = resolveEntryAt(result.asOf);
            const signalKey = buildSignalKey({
                strategy: SIGNAL_STRATEGIES.weeklyPullback,
                timeframe: '1wk',
                symbol: result.symbol,
                direction: 'HOLD',
                eventAt: entryAt,
            });

            const signal = {
                signalKey,
                symbol: result.symbol,
                date: signalSessionDate(entryAt),
                entryAt,
                timeframe: '1wk' as SignalTimeframe,
                signal: 'HOLD' as const,
                subtype: 'WATCHLIST' as const,
                price: result.ltp,
                rating: 0,
                signals: [`Weekly pullback watchlist: ${result.status}`],
                strategy: SIGNAL_STRATEGIES.weeklyPullback,
                status: 'WATCHLIST' as const,
                metadata: {
                    ema36: result.ema36,
                    percentDiff: result.percentDiff,
                    asOf: entryAt.toISOString(),
                    executable: false,
                },
            };

            await Signal.findOneAndUpdate({ signalKey }, signal, {
                upsert: true,
                new: true,
            });
        }

        console.log(
            `✅ Logged ${results.length} weekly pullback watchlist entries to MongoDB.`
        );
    } catch (err) {
        console.error('❌ Error logging watchlist entries to MongoDB:', err);
    }
}

/**
 * Close any open signal in the opposite direction for the same strategy.
 * A reversal is an exit for the old position, not a second independent trade.
 */
async function closeOppositeSignals(
    symbol: string,
    direction: SignalDirection,
    exitPrice: number,
    exitAt: Date
): Promise<void> {
    const opposite: SignalDirection = direction === 'BUY' ? 'SELL' : 'BUY';

    const openOpposite = await Signal.find({
        symbol,
        strategy: SIGNAL_STRATEGIES.emaCrossover,
        signal: opposite,
        status: 'OPEN',
    });

    for (const signal of openOpposite) {
        const performance = computePerformance(
            opposite === 'SELL' ? 'SELL' : 'BUY',
            signal.adjustedEntryPrice ?? signal.price,
            exitPrice,
            COST_MODEL
        );
        const holdingDays = daysBetween(signal.date, exitAt);

        await Signal.findByIdAndUpdate(signal._id, {
            status: 'CLOSED',
            exitPrice,
            exitDate: exitAt,
            exitReason: 'REVERSAL',
            performancePercent: performance.netPercent,
            grossPerformancePercent: performance.grossPercent,
            netPerformancePercent: performance.netPercent,
            lastPrice: exitPrice,
            holdingDays,
            lastUpdatedAt: new Date(),
        });

        console.log(
            `🔄 Closed ${symbol} ${opposite} at ₹${exitPrice.toFixed(2)} on reversal.`
        );
    }
}

/**
 * Logs EMA crossover analysis results to MongoDB.
 */
export async function logEMACrossoverSignals(
    results: EMACrossoverResult[]
): Promise<void> {
    if (!results.length) return;

    try {
        await connectToDatabase();

        for (const result of results) {
            const timeframe = result.timeframe ?? '15m';
            const entryAt = resolveEntryAt(result.asOf);
            const crossedAt = resolveEntryAt(
                result.crossedAt ?? result.asOf,
                entryAt
            );
            const direction: SignalDirection =
                result.crossoverType === 'BULLISH' ? 'BUY' : 'SELL';
            const signalKey = buildSignalKey({
                strategy: SIGNAL_STRATEGIES.emaCrossover,
                timeframe,
                symbol: result.symbol,
                direction,
                eventAt: crossedAt,
            });

            const signal = {
                signalKey,
                symbol: result.symbol,
                date: signalSessionDate(entryAt),
                entryAt,
                timeframe,
                crossedAt,
                signal: direction,
                subtype: 'CROSSOVER' as const,
                price: result.price,
                rating: 0,
                signals: [result.signal],
                stopLoss: result.stopLoss,
                target: result.target,
                strategy: SIGNAL_STRATEGIES.emaCrossover,
                status: 'OPEN' as const,
                metadata: {
                    ema9: result.ema9,
                    ema15: result.ema15,
                    ema50: result.ema50,
                    crossoverType: result.crossoverType,
                    rsi: result.rsi,
                    asOf: entryAt.toISOString(),
                    crossedAt: crossedAt.toISOString(),
                },
            };

            await Signal.findOneAndUpdate({ signalKey }, signal, {
                upsert: true,
                new: true,
            });

            // The opposite position is finished at this new entry price.
            await closeOppositeSignals(
                result.symbol,
                direction,
                result.price,
                entryAt
            );
        }

        console.log(
            `✅ Logged ${results.length} EMA crossover signals to MongoDB.`
        );
    } catch (err) {
        console.error('❌ Error logging EMA crossover signals to MongoDB:', err);
    }
}

async function markNeedsReview(
    signal: any,
    now: Date,
    reason: string
): Promise<void> {
    await Signal.findByIdAndUpdate(signal._id, {
        status: 'NEEDS_REVIEW',
        lastUpdatedAt: now,
        metadata: {
            ...(signal.metadata ?? {}),
            reviewReason: reason,
            reviewFlaggedAt: now.toISOString(),
        },
    });

    console.warn(
        `⚠️ ${signal.symbol} ${signal.strategy} marked NEEDS_REVIEW: ${reason}`
    );
}

async function closeStaleWithoutData(signal: any, now: Date): Promise<void> {
    const holdingDays = daysBetween(signal.date, now);
    const maxHolding =
        MAX_HOLDING_DAYS[signal.strategy] ?? DEFAULT_MAX_HOLDING_DAYS;

    if (holdingDays <= maxHolding) return;

    const direction: 'BUY' | 'SELL' = signal.signal === 'SELL' ? 'SELL' : 'BUY';
    const fallbackExit = signal.lastPrice ?? signal.price;
    const performance = computePerformance(
        direction,
        signal.adjustedEntryPrice ?? signal.price,
        fallbackExit,
        COST_MODEL
    );

    await Signal.findByIdAndUpdate(signal._id, {
        status: 'CLOSED',
        exitReason: 'DELISTED',
        holdingDays,
        performancePercent: performance.netPercent,
        grossPerformancePercent: performance.grossPercent,
        netPerformancePercent: performance.netPercent,
        lastUpdatedAt: now,
        metadata: {
            ...(signal.metadata ?? {}),
            delisted: true,
        },
    });

    console.warn(
        `⚠️ Closed stale ${signal.symbol} ${signal.strategy} after ${holdingDays} days with no data.`
    );
}

/**
 * Updates the performance of all open signals.
 *
 * - Groups by symbol + timeframe and fetches each series once.
 * - Uses intrabar high/low, not just the close.
 * - Uses the exact entry candle (`entryAt`) so the entry bar cannot trigger
 *   its own exit.
 * - Applies corporate-action adjustments before evaluating levels.
 * - Stores gross and net performance; net includes costs and slippage.
 * - Closes stale/delisted signals instead of leaving them open forever.
 */
export async function updateSignalPerformance(): Promise<void> {
    try {
        await connectToDatabase();

        const openSignals = await Signal.find({ status: 'OPEN' });
        if (!openSignals.length) {
            console.log('ℹ️ No open signals to update.');
            return;
        }

        type OpenSignal = (typeof openSignals)[number];
        interface SignalGroup {
            symbol: string;
            timeframe: SignalTimeframe;
            signals: OpenSignal[];
        }

        const groups = new Map<string, SignalGroup>();
        for (const signal of openSignals) {
            const timeframe = normalizeTimeframe(signal.timeframe, signal.strategy);
            const key = `${signal.symbol}|${timeframe}`;
            const group = groups.get(key);

            if (group) {
                group.signals.push(signal);
            } else {
                groups.set(key, {
                    symbol: signal.symbol,
                    timeframe,
                    signals: [signal],
                });
            }
        }

        const now = new Date();
        const splitsBySymbol = new Map<string, SplitEvent[]>();
        // Performance writes are batched: with a large historical backlog,
        // one round trip per signal would risk the Lambda timeout.
        const pendingUpdates: any[] = [];

        console.log(
            `🔄 Updating performance for ${openSignals.length} open signals across ${groups.size} symbol/timeframe groups...`
        );

        await processWithConcurrency(
            [...groups.values()],
            async group => {
                const { symbol, timeframe, signals } = group;
                const oldest = Math.min(...signals.map(s => s.date.getTime()));
                const ageDays = Math.max(
                    0,
                    (now.getTime() - oldest) / 86400000
                );
                const lookbackDays = lookbackFor(timeframe, ageDays);

                const candles = await fetchHistoricalData(
                    symbol,
                    lookbackDays,
                    timeframe
                );

                if (!candles.length) {
                    console.warn(
                        `⚠️ No ${timeframe} candles available for ${symbol}; checking stale signals.`
                    );
                    for (const signal of signals) {
                        await closeStaleWithoutData(signal, now);
                    }
                    return;
                }

                let splits = splitsBySymbol.get(symbol);
                if (!splits) {
                    splits = await fetchCorporateActions(
                        symbol,
                        Math.max(lookbackDays, 30)
                    );
                    splitsBySymbol.set(symbol, splits);
                }

                const last = candles[candles.length - 1];
                const lastClose = last.close;
                const lastDate = new Date(last.date);

                for (const signal of signals) {
                    const direction: 'BUY' | 'SELL' =
                        signal.signal === 'SELL' ? 'SELL' : 'BUY';

                    const entryAt = signal.entryAt
                        ? new Date(signal.entryAt)
                        : resolveEntryAt(signal.metadata?.asOf, signal.date);

                    const ratio = cumulativeSplitRatio(splits, entryAt);
                    const adjusted = adjustLevelsForSplits(
                        signal.price,
                        signal.stopLoss,
                        signal.target,
                        ratio
                    );

                    if (!adjusted) {
                        await markNeedsReview(
                            signal,
                            now,
                            'invalid corporate-action ratio'
                        );
                        continue;
                    }

                    const maxHolding =
                        MAX_HOLDING_DAYS[signal.strategy] ??
                        DEFAULT_MAX_HOLDING_DAYS;

                    // Only candles inside the allowed holding window may
                    // trigger an exit. A stale signal must not inherit a
                    // stop/target hit that happened months later.
                    const eligible = candles.filter(candle =>
                        isWithinHoldingWindow(candle.date, entryAt, maxHolding)
                    );

                    // If we have no split events but see a huge gap, do not
                    // turn a corporate action into a fake stop.
                    if (splits.length === 0) {
                        const gap = detectUnexplainedGap(eligible);
                        if (gap.found) {
                            await markNeedsReview(
                                signal,
                                now,
                                `unexplained ${gap.changePercent?.toFixed(
                                    1
                                )}% gap from ${gap.from} to ${gap.to}`
                            );
                            continue;
                        }
                    }

                    let status: 'OPEN' | 'HIT_TARGET' | 'HIT_SL' | 'CLOSED' =
                        'OPEN';
                    let exitPrice: number | undefined;
                    let exitDate: Date | undefined;
                    let exitReason: ExitReason | undefined;

                    for (const candle of eligible) {
                        // If both levels are touched in the same bar, assume the
                        // stop was hit first. This is the conservative choice.
                        if (direction === 'SELL') {
                            if (
                                adjusted.stopLoss != null &&
                                candle.high >= adjusted.stopLoss
                            ) {
                                status = 'HIT_SL';
                                exitPrice = adjusted.stopLoss;
                                exitDate = new Date(candle.date);
                                exitReason = 'STOP';
                                break;
                            }
                            if (
                                adjusted.target != null &&
                                candle.low <= adjusted.target
                            ) {
                                status = 'HIT_TARGET';
                                exitPrice = adjusted.target;
                                exitDate = new Date(candle.date);
                                exitReason = 'TARGET';
                                break;
                            }
                        } else {
                            if (
                                adjusted.stopLoss != null &&
                                candle.low <= adjusted.stopLoss
                            ) {
                                status = 'HIT_SL';
                                exitPrice = adjusted.stopLoss;
                                exitDate = new Date(candle.date);
                                exitReason = 'STOP';
                                break;
                            }
                            if (
                                adjusted.target != null &&
                                candle.high >= adjusted.target
                            ) {
                                status = 'HIT_TARGET';
                                exitPrice = adjusted.target;
                                exitDate = new Date(candle.date);
                                exitReason = 'TARGET';
                                break;
                            }
                        }
                    }

                    const holdingDays = daysBetween(signal.date, now);
                    const overdueDays = holdingDays - maxHolding;

                    if (status === 'OPEN' && holdingDays > maxHolding) {
                        status = 'CLOSED';
                        exitPrice = lastClose;
                        exitDate = lastDate;
                        exitReason = 'MAX_HOLDING';
                    }

                    const markPrice = exitPrice ?? lastClose;
                    const performance = computePerformance(
                        direction,
                        adjusted.entry,
                        markPrice,
                        COST_MODEL
                    );

                    const metadata: Record<string, unknown> = {
                        ...(signal.metadata ?? {}),
                        splitRatio: ratio,
                        performanceTimeframe: timeframe,
                    };

                    // A signal closed long after its holding window is a backlog
                    // reconciliation, not a trade that closed this week. Mark it
                    // so the weekly report does not count it as new activity.
                    if (exitReason === 'MAX_HOLDING' && overdueDays > 2) {
                        metadata.backlogClose = true;
                    }

                    pendingUpdates.push({
                        updateOne: {
                            filter: { _id: signal._id },
                            update: {
                                $set: {
                                    lastPrice: lastClose,
                                    performancePercent: performance.netPercent,
                                    grossPerformancePercent: performance.grossPercent,
                                    netPerformancePercent: performance.netPercent,
                                    adjustedEntryPrice: adjusted.entry,
                                    status,
                                    exitPrice,
                                    exitDate,
                                    exitReason,
                                    holdingDays,
                                    lastUpdatedAt: now,
                                    metadata,
                                },
                            },
                        },
                    });
                }
            },
            5,
            100
        );

        if (pendingUpdates.length) {
            const chunkSize = 500;
            for (let i = 0; i < pendingUpdates.length; i += chunkSize) {
                await Signal.bulkWrite(pendingUpdates.slice(i, i + chunkSize), {
                    ordered: false,
                });
            }
            console.log(`💾 Persisted ${pendingUpdates.length} performance updates.`);
        }

        console.log('✅ Updated all open signals performance.');
    } catch (err) {
        console.error('❌ Error updating signal performance:', err);
    }
}
