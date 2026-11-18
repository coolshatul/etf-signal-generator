import { analyzeNifty50EMACrossover } from '../services/analyzeNifty50EMACrossover';
import { sendEMACrossoverAlert } from '../alerts/telegram';
import { sendEMACrossoverEmail } from '../alerts/email';
import { logEMACrossoverSignals, filterNewSignals } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';
import { ALERT_CHANNELS, DEDUPE_COOLDOWN_MS } from '../config/settings';
import {
    SIGNAL_STRATEGIES,
    buildSignalKey,
    resolveEntryAt,
} from '../utils/signalIdentity';

const STRATEGY = SIGNAL_STRATEGIES.emaCrossover;
const TIMEFRAME = '15m' as const;

export const handler = async (): Promise<void> => {
    console.log('📊 Starting daily Nifty50 EMA crossover analysis...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping EMA crossover analysis.');
        return;
    }

    try {
        const emaCrossoverResults = await analyzeNifty50EMACrossover();

        // This scan runs every 15 minutes. The signal key is the cross bar, so
        // the same cross can never alert twice, even after it is stopped out.
        const { fresh: newSignals, dedupeVerified } = await filterNewSignals(
            emaCrossoverResults,
            STRATEGY,
            {
                timeframe: TIMEFRAME,
                signalFor: result =>
                    result.crossoverType === 'BULLISH' ? 'BUY' : 'SELL',
                cooldownMs: DEDUPE_COOLDOWN_MS[STRATEGY] ?? 0,
                keyFor: (result, direction) =>
                    buildSignalKey({
                        strategy: STRATEGY,
                        timeframe: result.timeframe ?? TIMEFRAME,
                        symbol: result.symbol,
                        direction,
                        eventAt: resolveEntryAt(
                            result.crossedAt ?? result.asOf
                        ),
                    }),
            }
        );

        if (!dedupeVerified) {
            console.error(
                '⛔ Dedupe unavailable; skipping crossover alerts to avoid duplicates.'
            );
            return;
        }

        console.log(
            `✅ Completed EMA crossover analysis. ${newSignals.length} new of ${emaCrossoverResults.length} total signals.`
        );

        if (!newSignals.length) {
            console.log('📭 No new EMA crossover signals found - skipping alerts.');
            return;
        }

        // Send Telegram Alert (optional, off unless explicitly enabled)
        if (ALERT_CHANNELS.telegram) {
            await sendEMACrossoverAlert(newSignals);
        }

        // Send Email Alert
        if (ALERT_CHANNELS.email) {
            await sendEMACrossoverEmail(newSignals);
        }

        // Log to DB
        await logEMACrossoverSignals(newSignals);

        console.log(
            `📬 Sent alerts for ${newSignals.length} new EMA crossover signals.`
        );
    } catch (err) {
        console.error('❌ Error analyzing Nifty50 EMA crossovers:', err);
    }

    console.log('🎯 Nifty50 EMA crossover analysis completed.');
};
