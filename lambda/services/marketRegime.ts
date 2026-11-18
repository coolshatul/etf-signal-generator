import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { LOOKBACK_DAYS } from '../utils/common';

export interface MarketRegime {
    isBullish: boolean;
    trend: 'UP' | 'DOWN' | 'SIDEWAYS';
    ltp: number;
    ema50: number;
    rsi: number;
    percentFromEMA: number;
}

/**
 * Analyzes the Nifty 50 index to determine the overall market regime.
 * Uses NIFTY 50 (^NSEI) as the benchmark.
 */
export async function getMarketRegime(): Promise<MarketRegime> {
    const symbol = '^NSEI'; // Nifty 50 Index

    try {
        const rawData = await fetchHistoricalData(symbol, LOOKBACK_DAYS.daily);
        if (!rawData.length) {
            throw new Error('Could not fetch Nifty 50 data');
        }

        const dataWithIndicators = calculateIndicators(rawData);
        const lastCandle = dataWithIndicators[dataWithIndicators.length - 1];
        const prevCandle = dataWithIndicators[Math.max(0, dataWithIndicators.length - 10)];

        const { close: ltp, ema50, rsi } = lastCandle;

        if (ema50 == null) {
            return { isBullish: false, trend: 'SIDEWAYS', ltp, ema50: 0, rsi: rsi ?? 0, percentFromEMA: 0 };
        }

        const percentFromEMA = ((ltp - ema50) / ema50) * 100;

        // Bullish if price is above 50 EMA and trend is not sharply down
        const isBullish = ltp > ema50;

        let trend: 'UP' | 'DOWN' | 'SIDEWAYS' = 'SIDEWAYS';
        if (ltp > prevCandle.close * 1.01) trend = 'UP';
        else if (ltp < prevCandle.close * 0.99) trend = 'DOWN';

        return {
            isBullish,
            trend,
            ltp,
            ema50,
            rsi: rsi ?? 0,
            percentFromEMA
        };
    } catch (error) {
        console.error('❌ Error fetching market regime:', error);
        // Fail closed: never treat a data failure as a bullish regime.
        return { isBullish: false, trend: 'SIDEWAYS', ltp: 0, ema50: 0, rsi: 50, percentFromEMA: 0 };
    }
}
