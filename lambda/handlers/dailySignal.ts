import { analyzeEtfBullish } from '../services/analyzeEtfBullish';
import { sendBullishStocksAlert } from '../alerts/telegram';
import { sendBookCapacityEmail, sendBullishStocksEmail } from '../alerts/email';
import {
    filterNewSignals,
    getOpenBook,
    getUnsentSignals,
    logBullishSignals,
    markAlertsSent,
} from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';
import {
    ALERT_CHANNELS,
    BOOK_LIMITS,
    DEDUPE_COOLDOWN_MS,
} from '../config/settings';
import { selectWithinBookLimits } from '../utils/bookLimits';
import {
    SIGNAL_STRATEGIES,
    buildSignalKey,
    resolveEntryAt,
} from '../utils/signalIdentity';
import { BullishStockResult } from '../types';
import { ISignal } from '../db/models';

const STRATEGY = SIGNAL_STRATEGIES.etfBullish;
const TIMEFRAME = '1d' as const;

/**
 * Rebuild the alert shape from a stored row. Used by the retry path when a
 * previous run persisted a signal but failed to deliver the email.
 */
function toAlertResult(doc: ISignal): BullishStockResult {
    return {
        symbol: doc.symbol,
        isBullish: true,
        rating: doc.rating,
        price: doc.price,
        signals: doc.signals ?? [],
        stopLoss: doc.stopLoss,
        target: doc.target,
        stopLossPercent: doc.metadata?.stopLossPercent ?? 0,
        targetPercent: doc.metadata?.targetPercent ?? 0,
        riskRewardRatio: doc.riskRewardRatio,
        swingLow: doc.metadata?.swingLow ?? 0,
        swingHigh: doc.metadata?.swingHigh ?? 0,
        baseStopLevel: 0,
        maxEntry: doc.maxEntry,
        marketRegimeBullish: doc.metadata?.marketRegimeBullish,
        asOf: doc.metadata?.asOf,
    };
}

export const handler = async (): Promise<void> => {
    console.log('📡 Starting daily ETF bullish scan...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping ETF bullish analysis.');
        return;
    }

    try {
        const bullishResults = await analyzeEtfBullish();

        // Only alert on positions that are not already open and whose exact
        // signal event has not been seen before.
        const { fresh, dedupeVerified } = await filterNewSignals(
            bullishResults,
            STRATEGY,
            {
                timeframe: TIMEFRAME,
                cooldownMs: DEDUPE_COOLDOWN_MS[STRATEGY] ?? 0,
                keyFor: result =>
                    buildSignalKey({
                        strategy: STRATEGY,
                        timeframe: TIMEFRAME,
                        symbol: result.symbol,
                        direction: 'BUY',
                        eventAt: resolveEntryAt(result.asOf),
                    }),
            }
        );

        if (!dedupeVerified) {
            console.error(
                '⛔ Dedupe unavailable; skipping bullish alerts to avoid duplicates.'
            );
            return;
        }

        // Book-level limits: the strategy is one long-India bet, so the
        // number of simultaneous positions and per-group concentration cap
        // what can be added today. Highest-rated setups win the slots.
        const book = await getOpenBook(STRATEGY);
        const { accepted, skippedSlots, skippedGroup } = selectWithinBookLimits(
            fresh,
            book,
            BOOK_LIMITS
        );

        console.log(
            `📚 Book ${book.count}/${BOOK_LIMITS.maxOpenPositions} open; accepted ${accepted.length}, skipped ${skippedSlots} (slots), ${skippedGroup} (group cap)`
        );

        // Persist first. The alert is only marked as sent after delivery, so a
        // failed email is retried instead of silently dropped.
        if (accepted.length) {
            await logBullishSignals(accepted, STRATEGY, TIMEFRAME);
        }

        const pending = await getUnsentSignals(STRATEGY);

        if (!pending.length) {
            if (fresh.length && accepted.length === 0 && ALERT_CHANNELS.email) {
                await sendBookCapacityEmail({
                    open: book.count,
                    cap: BOOK_LIMITS.maxOpenPositions,
                    setups: fresh.map(result => ({
                        symbol: result.symbol,
                        rating: result.rating,
                        maxEntry: result.maxEntry,
                    })),
                });
            }
            console.log('📭 No new bullish signals - skipping alerts.');
            return;
        }

        const alertResults = pending.map(toAlertResult);

        if (ALERT_CHANNELS.telegram) {
            await sendBullishStocksAlert(alertResults);
        }

        if (ALERT_CHANNELS.email) {
            await sendBullishStocksEmail(alertResults);
        }

        await markAlertsSent(pending.map(doc => String(doc._id)));

        console.log(
            `✅ ETF bullish scan complete. Alerts sent for ${alertResults.length} signal${
                alertResults.length === 1 ? '' : 's'
            }.`
        );
    } catch (err) {
        console.error('❌ Error analyzing ETFs:', err);
    }

    console.log('🎯 ETF bullish analysis completed.');
};
