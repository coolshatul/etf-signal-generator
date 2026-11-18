// Timezone and market-session helpers.
// All signal calculations should be based on completed candles in IST.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30
const DAY_MS = 24 * 60 * 60 * 1000;

export type SupportedInterval = '15m' | '1h' | '1d' | '1wk' | '1mo';

// NSE regular session closes at 15:30 IST. Give a small buffer for the
// exchange/Yahoo to publish the final bar.
export const MARKET_CLOSE_MINUTES_IST = 15 * 60 + 35;

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function istParts(date: Date) {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return {
        year: ist.getUTCFullYear(),
        month: ist.getUTCMonth(),
        day: ist.getUTCDate(),
        dayOfWeek: ist.getUTCDay(), // 0 = Sunday
        minutesOfDay: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    };
}

/** YYYY-MM-DD for the IST calendar date. */
export function istDateKey(date: Date): string {
    const p = istParts(date);
    return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}

/** UTC instant corresponding to 00:00 IST on the given date's IST calendar day. */
export function startOfIstDay(date: Date): Date {
    const p = istParts(date);
    return new Date(Date.UTC(p.year, p.month, p.day) - IST_OFFSET_MS);
}

/** YYYY-MM-DD of the Monday starting the IST week that contains `date`. */
export function istWeekStartKey(date: Date): string {
    const p = istParts(date);
    const daysSinceMonday = (p.dayOfWeek + 6) % 7;
    const monday = new Date(Date.UTC(p.year, p.month, p.day) - daysSinceMonday * DAY_MS);
    return `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`;
}

export function isMarketClosed(date: Date = new Date()): boolean {
    const p = istParts(date);
    if (p.dayOfWeek === 0 || p.dayOfWeek === 6) return true;
    return p.minutesOfDay >= MARKET_CLOSE_MINUTES_IST;
}

/**
 * Returns true when a candle is final and safe to use for signals.
 *
 * Daily  : today's candle is incomplete until 15:35 IST.
 * Weekly : the current week's candle is incomplete until Friday 15:35 IST.
 * Intraday: the bar is incomplete until its full duration has elapsed.
 */
export function isCandleComplete(
    candleDate: Date,
    interval: SupportedInterval,
    now: Date = new Date()
): boolean {
    if (Number.isNaN(candleDate.getTime())) return false;

    if (interval === '15m' || interval === '1h') {
        const durationMs = (interval === '15m' ? 15 : 60) * 60 * 1000;
        return candleDate.getTime() + durationMs <= now.getTime();
    }

    if (interval === '1d') {
        if (istDateKey(candleDate) !== istDateKey(now)) return true;
        return istParts(now).minutesOfDay >= MARKET_CLOSE_MINUTES_IST;
    }

    if (interval === '1wk') {
        if (istWeekStartKey(candleDate) !== istWeekStartKey(now)) return true;

        const p = istParts(now);
        // Saturday/Sunday: the week is finished.
        if (p.dayOfWeek === 0 || p.dayOfWeek === 6) return true;
        // Friday after the close: the week is finished.
        if (p.dayOfWeek === 5 && p.minutesOfDay >= MARKET_CLOSE_MINUTES_IST) return true;
        return false;
    }

    if (interval === '1mo') {
        const candle = istDateKey(candleDate).slice(0, 7);
        return candle !== istDateKey(now).slice(0, 7);
    }

    return true;
}

/** Max age (ms) of the latest completed candle before data is considered stale. */
export function stalenessLimitMs(interval: SupportedInterval): number {
    switch (interval) {
        case '15m':
            return 5 * DAY_MS;
        case '1h':
            return 10 * DAY_MS;
        case '1d':
            return 7 * DAY_MS;
        case '1wk':
            return 21 * DAY_MS;
        case '1mo':
            return 60 * DAY_MS;
        default:
            return 7 * DAY_MS;
    }
}
