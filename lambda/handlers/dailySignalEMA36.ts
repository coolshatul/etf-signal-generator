import { analyzeEtfWeeklyPullback } from '../services/analyzeEtfWeeklyPullback';
import { sendEMA36Alert } from '../alerts/telegram';
import { sendEMA36Email } from '../alerts/email';
import { logEMA36Signals, filterNewSignals } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';
import { ALERT_CHANNELS } from '../config/settings';
import {
    SIGNAL_STRATEGIES,
    buildSignalKey,
    resolveEntryAt,
} from '../utils/signalIdentity';

const STRATEGY = SIGNAL_STRATEGIES.weeklyPullback;
const TIMEFRAME = '1wk' as const;

export const handler = async (): Promise<void> => {
    console.log('📊 Starting daily ETF weekly pullback analysis...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping weekly pullback analysis.');
        return;
    }

    try {
        const ema36Results = await analyzeEtfWeeklyPullback();

        // Only alert on new watchlist entries. The weekly candle timestamp is
        // the event key, so the same week does not alert every day.
        const { fresh: newSignals, dedupeVerified } = await filterNewSignals(
            ema36Results,
            STRATEGY,
            {
                timeframe: TIMEFRAME,
                signalFor: () => 'HOLD',
                keyFor: result =>
                    buildSignalKey({
                        strategy: STRATEGY,
                        timeframe: TIMEFRAME,
                        symbol: result.symbol,
                        direction: 'HOLD',
                        eventAt: resolveEntryAt(result.asOf),
                    }),
            }
        );

        if (!dedupeVerified) {
            console.error(
                '⛔ Dedupe unavailable; skipping watchlist alerts to avoid duplicates.'
            );
            return;
        }

        if (!newSignals.length) {
            console.log('📭 No new weekly pullback candidates - skipping alerts.');
            return;
        }

        // Send Telegram Alert (optional, off unless explicitly enabled)
        if (ALERT_CHANNELS.telegram) {
            await sendEMA36Alert(newSignals);
        }

        // Send Email Alert
        if (ALERT_CHANNELS.email) {
            await sendEMA36Email(newSignals);
        }

        // Log to DB
        await logEMA36Signals(newSignals);

        console.log(
            `✅ Completed weekly pullback analysis. Found ${newSignals.length} new watchlist entries.`
        );
    } catch (err) {
        console.error('❌ Error analyzing ETF weekly pullback:', err);
    }

    console.log('🎯 ETF weekly pullback analysis completed.');
};
