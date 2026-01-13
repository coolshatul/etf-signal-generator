import { connectToDatabase } from './connection';
import { Signal } from './models';
import { BullishStockResult, EMA36Result } from '../types';

/**
 * Logs bullish stock analysis results to MongoDB.
 * @param results Array of bullish stock results
 */
export async function logBullishSignals(results: BullishStockResult[]): Promise<void> {
    if (!results.length) return;

    try {
        await connectToDatabase();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const signalsToLog = results.map(r => ({
            symbol: r.symbol,
            date: today,
            signal: 'BUY', // bullish result implies BUY in this context
            price: r.price,
            rating: r.rating,
            signals: r.signals,
            stopLoss: r.stopLoss,
            target: r.target,
            riskRewardRatio: r.riskRewardRatio,
            strategy: 'BULLISH_SCAN',
            metadata: {
                swingLow: r.swingLow,
                swingHigh: r.swingHigh,
                stopLossPercent: r.stopLossPercent,
                targetPercent: r.targetPercent
            }
        }));

        // Use upsert to avoid duplicates if run multiple times in a day
        for (const signal of signalsToLog) {
            await Signal.findOneAndUpdate(
                { symbol: signal.symbol, date: signal.date, strategy: signal.strategy },
                signal,
                { upsert: true, new: true }
            );
        }

        console.log(`✅ Logged ${results.length} bullish signals to MongoDB.`);
    } catch (err) {
        console.error('❌ Error logging signals to MongoDB:', err);
    }
}

/**
 * Logs EMA36 analysis results to MongoDB.
 * @param results Array of EMA36 results
 */
export async function logEMA36Signals(results: EMA36Result[]): Promise<void> {
    if (!results.length) return;

    try {
        await connectToDatabase();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const signalsToLog = results.map(r => ({
            symbol: r.symbol,
            date: today,
            signal: 'BUY', // Approaching breakout is a potential BUY signal
            price: r.ltp,
            rating: 0,
            signals: [`EMA36 Status: ${r.status}`],
            strategy: 'EMA36_SCAN',
            metadata: {
                ema36: r.ema36,
                percentDiff: r.percentDiff
            }
        }));

        for (const signal of signalsToLog) {
            await Signal.findOneAndUpdate(
                { symbol: signal.symbol, date: signal.date, strategy: signal.strategy },
                signal,
                { upsert: true, new: true }
            );
        }

        console.log(`✅ Logged ${results.length} EMA36 signals to MongoDB.`);
    } catch (err) {
        console.error('❌ Error logging EMA36 signals to MongoDB:', err);
    }
}
