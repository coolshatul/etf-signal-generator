import { fetchHistoricalData } from '../utils/fetchData';
import { EMACrossoverResult } from '../types';
import { calculateIndicators } from '../utils/indicators';
import { nifty50Symbols, processWithConcurrency } from '../utils/common';

// Configuration
const CONFIG = {
    MIN_DATA_POINTS: 100,  // Need sufficient data for reliable EMAs
};

/**
 * Analyzes a single stock for EMA cascade crossover with price proximity
 */
async function analyzeEMACrossoverStock(symbol: string): Promise<EMACrossoverResult | null> {
    try {
        // Fetch 15-minute historical data (260 periods ≈ 2 weeks for sufficient EMA data)
        const rawData = await fetchHistoricalData(symbol, 260, '15m');
        if (!rawData.length || rawData.length < CONFIG.MIN_DATA_POINTS) {
            return null;
        }

        // Calculate indicators using unified utility
        const dataWithIndicators = calculateIndicators(rawData);
        const lastCandle = dataWithIndicators[dataWithIndicators.length - 1];

        const { close: price, ema9, ema15, ema50 } = lastCandle;

        // Ensure all EMAs are available
        if (!ema9 || !ema15 || !ema50) {
            return null;
        }

        // Check if EMAs are in bullish cascade alignment: EMA9 > EMA15 > EMA50
        const bullishAlignment = ema9 > ema15 && ema15 > ema50;

        // Check if EMAs are in bearish cascade alignment: EMA9 < EMA15 < EMA50
        const bearishAlignment = ema9 < ema15 && ema15 < ema50;

        // If EMAs are not in cascade alignment, no signal
        if (!bullishAlignment && !bearishAlignment) {
            return null;
        }

        // Check if price is within 1% of any EMA
        const priceNearEMA9 = Math.abs(price - ema9) / ema9 <= 0.01;
        const priceNearEMA15 = Math.abs(price - ema15) / ema15 <= 0.01;
        const priceNearEMA50 = Math.abs(price - ema50) / ema50 <= 0.01;

        const priceNearAnyEMA = priceNearEMA9 || priceNearEMA15 || priceNearEMA50;

        // Only signal if EMAs are aligned AND price is near the crossover levels
        if (priceNearAnyEMA) {
            const crossoverType = bullishAlignment ? 'BULLISH' : 'BEARISH';
            const alignment = bullishAlignment ? 'EMA9 > EMA15 > EMA50' : 'EMA9 < EMA15 < EMA50';
            const nearEMAs = [];
            if (priceNearEMA9) nearEMAs.push('EMA9');
            if (priceNearEMA15) nearEMAs.push('EMA15');
            if (priceNearEMA50) nearEMAs.push('EMA50');

            return {
                symbol,
                price,
                ema9,
                ema15,
                ema50,
                crossoverType,
                signal: `${alignment} cascade alignment with price near ${nearEMAs.join(', ')} (${crossoverType.toLowerCase()} support/resistance)`
            };
        }

        return null;
    } catch (error) {
        console.error(`Error analyzing ${symbol} for EMA crossover:`, error);
        return null;
    }
}

/**
 * Analyzes Nifty50 stocks for EMA cascade crossover signals
 * @returns {Promise<EMACrossoverResult[]>} Array of stocks with EMA crossover signals
 */
export async function analyzeNifty50EMACrossover(): Promise<EMACrossoverResult[]> {
    console.log('📊 Analyzing Nifty50 stocks for EMA cascade crossover signals...');

    // Analyze each stock with concurrency control to avoid rate limits
    const allResults = await processWithConcurrency(nifty50Symbols, analyzeEMACrossoverStock);

    // Filter out null results
    const results = allResults.filter((result): result is EMACrossoverResult => result !== null);

    console.log(`✅ Found ${results.length} stocks with EMA cascade crossover signals out of ${nifty50Symbols.length}`);

    return results;
}
