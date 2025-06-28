import yahooFinance from 'yahoo-finance2';
import { Candle } from '../types';
yahooFinance.suppressNotices(['ripHistorical']);


// Fetch historical daily data for a given symbol and number of past days
export async function fetchHistoricalData(symbol: string, days: number): Promise<Candle[]> {
    const to = new Date();
    const from = new Date(to);
    from.setDate(to.getDate() - days);

    const queryOptions = {
        period1: from.toISOString(),
        interval: '1d' as const,
    };

    try {
        const results = await yahooFinance.historical(`${symbol}.NS`, queryOptions);
        if (!results || results.length === 0) {
            throw new Error(`No historical data found for ${symbol}`);
        }

        // Map to simplified structure
        return results.map((item) => ({
            date: item.date.toISOString().split('T')[0],
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
        }));
    } catch (err) {
        console.error(`❌ Error fetching data for ${symbol}:`, err);
        return [];
    }
}
