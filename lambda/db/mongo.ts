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
            status: 'OPEN',
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
            status: 'OPEN',
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
import { fetchHistoricalData } from '../utils/fetchData';

/**
 * Updates the performance of all open signals by fetching latest prices.
 */
export async function updateSignalPerformance(): Promise<void> {
    try {
        await connectToDatabase();

        // Find all open signals
        const openSignals = await Signal.find({ status: 'OPEN' });
        if (!openSignals.length) {
            console.log('ℹ️ No open signals to update.');
            return;
        }

        console.log(`🔄 Updating performance for ${openSignals.length} open signals...`);

        for (const signal of openSignals) {
            // Fetch latest 2 days of data to get LTP
            const data = await fetchHistoricalData(signal.symbol, 5);
            if (!data.length) continue;

            const ltp = data[data.length - 1].close;
            const perf = ((ltp - signal.price) / signal.price) * 100;

            let status = 'OPEN';
            if (signal.target && ltp >= signal.target) status = 'HIT_TARGET';
            else if (signal.stopLoss && ltp <= signal.stopLoss) status = 'HIT_SL';

            await Signal.findByIdAndUpdate(signal._id, {
                lastPrice: ltp,
                performancePercent: perf,
                status
            });
        }

        console.log('✅ Updated all open signals performance.');
    } catch (err) {
        console.error('❌ Error updating signal performance:', err);
    }
}
