import { analyzeEtfBullish } from '../services/analyzeEtfBullish';
import { sendBullishStocksAlert } from '../alerts/telegram';
import { sendBullishStocksEmail } from '../alerts/email';
import { logBullishSignals, filterNewSignals } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';
import { ALERT_CHANNELS, DEDUPE_COOLDOWN_MS } from '../config/settings';
import {
    SIGNAL_STRATEGIES,
    buildSignalKey,
    resolveEntryAt,
} from '../utils/signalIdentity';

const STRATEGY = SIGNAL_STRATEGIES.etfBullish;
const TIMEFRAME = '1d' as const;

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
        const { fresh: newSignals, dedupeVerified } = await filterNewSignals(
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

        if (!newSignals.length) {
            console.log('📭 No new bullish signals - skipping alerts.');
            return;
        }

        // Send Telegram Alert (optional, off unless explicitly enabled)
        if (ALERT_CHANNELS.telegram) {
            await sendBullishStocksAlert(newSignals);
        }

        // Send Email Alert
        if (ALERT_CHANNELS.email) {
            await sendBullishStocksEmail(newSignals);
        }

        // Log to DB
        await logBullishSignals(newSignals, STRATEGY, TIMEFRAME);

        console.log(
            `✅ Completed ETF bullish analysis. Found ${newSignals.length} new signals.`
        );
    } catch (err) {
        console.error('❌ Error analyzing ETFs:', err);
    }

    console.log('🎯 ETF bullish analysis completed.');
};
