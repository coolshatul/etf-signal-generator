// Stable signal identity.
//
// A signal must have an immutable key so re-running a scanner cannot create a
// duplicate row (or overwrite an opposite-direction row from the same session).
// The key intentionally includes the direction and timeframe: the old
// `{symbol, date, strategy}` unique index made a same-day BUY and SELL collide.

import { SignalDirection, SignalTimeframe } from '../types';
import { startOfIstDay } from './marketTime';

export const SIGNAL_STRATEGIES = {
    // Live scans now run on the ETF universe. BULLISH_SCAN is kept so the
    // historical stock signals keep their own identity and statistics.
    etfBullish: 'ETF_BULLISH_SCAN',
    bullish: 'BULLISH_SCAN',
    weeklyPullback: 'WEEKLY_PULLBACK_WATCHLIST',
    emaCrossover: 'EMA_CROSSOVER_SCAN',
    legacyEMA36: 'EMA36_SCAN',
} as const;

export type SignalStrategy = (typeof SIGNAL_STRATEGIES)[keyof typeof SIGNAL_STRATEGIES];

/** Parse an ISO timestamp (or Date) and return null when invalid. */
export function parseIsoDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The exact candle timestamp used for entry. Falls back to the supplied date
 * when a legacy row has no `asOf`.
 */
export function resolveEntryAt(
    asOf?: string | Date | null,
    fallback?: Date | string | null
): Date {
    const parsed = parseIsoDate(asOf);
    if (parsed) return parsed;

    const fallbackDate = parseIsoDate(fallback);
    if (fallbackDate) return fallbackDate;

    // Last-resort fallback. Scanners always provide `asOf`, so this should only
    // be reached by malformed legacy data.
    return new Date();
}

/** IST calendar day used for the human-facing `date` field. */
export function signalSessionDate(entryAt: Date): Date {
    return startOfIstDay(entryAt);
}

export interface SignalKeyInput {
    strategy: string;
    timeframe: SignalTimeframe;
    symbol: string;
    direction: SignalDirection;
    eventAt: Date | string;
}

/**
 * Build the immutable idempotency key.
 *
 * `eventAt` is:
 * - the exact candle timestamp for daily/weekly signals, and
 * - the bar where the EMA9/15 cross actually happened for crossovers.
 *
 * Using the cross bar (not the last bar) means the same cross cannot alert
 * again after it has been stopped out or targeted.
 */
export function buildSignalKey(input: SignalKeyInput): string {
    const eventAt = parseIsoDate(input.eventAt);
    if (!eventAt) {
        throw new Error(
            `Cannot build signal key without a valid event timestamp for ${input.symbol}`
        );
    }

    return [
        input.strategy,
        input.timeframe,
        input.symbol.trim().toUpperCase(),
        input.direction,
        eventAt.toISOString(),
    ].join('|');
}
