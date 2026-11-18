import { fetchHistoricalData } from '../utils/fetchData';
import { EMA36Result } from '../types';
import { calculateIndicators } from '../utils/indicators';
import { liquidEtfSymbols, processWithConcurrency, LOOKBACK_DAYS } from '../utils/common';

// Configuration
const CONFIG = {
    EMA_PERIOD: 36,
    MIN_DATA_POINTS: 50,  // Need at least 50 weeks for reliable EMA
    APPROACHING_BREAKOUT_THRESHOLD: 2 // Max distance below EMA for approaching breakout (2%)
};

/**
 * Analyzes a single ETF for EMA36 status
 */
async function analyzeEMA36Etf(symbol: string): Promise<EMA36Result | null> {
    try {
        // Fetch ~3 years of weekly historical data
        const rawData = await fetchHistoricalData(symbol, LOOKBACK_DAYS.weekly, '1wk');

        if (!rawData.length || rawData.length < CONFIG.MIN_DATA_POINTS) {
            return null;
        }

        // Calculate indicators using unified utility
        const dataWithIndicators = calculateIndicators(rawData);
        const lastCandle = dataWithIndicators[dataWithIndicators.length - 1];

        const { close: ltp, ema36 } = lastCandle;

        if (!ema36) {
            return null;
        }

        // Calculate percentage difference
        const percentDiff = ((ltp - ema36) / ema36) * 100;

        let status: 'APPROACHING_BREAKOUT' | null = null;

        // Check if below EMA but approaching breakout (within 2% below)
        if (percentDiff < 0 && percentDiff > -CONFIG.APPROACHING_BREAKOUT_THRESHOLD) {
            status = 'APPROACHING_BREAKOUT';
        }

        if (status) {
            return {
                symbol,
                ltp,
                ema36,
                status,
                percentDiff,
                asOf: lastCandle.date,
            };
        }

        return null;
    } catch (error) {
        console.error(`Error analyzing ${symbol} for EMA36:`, error);
        return null;
    }
}

/**
 * Analyzes the liquid ETF universe for weekly 36-EMA pullbacks
 * @returns {Promise<EMA36Result[]>} Array of ETFs below or near the 36-week EMA
 */
export async function analyzeEtfWeeklyPullback(): Promise<EMA36Result[]> {
    console.log('📊 Analyzing ETFs for weekly 36-EMA pullbacks...');

    // Analyze each ETF with concurrency control to avoid rate limits
    const allResults = await processWithConcurrency(liquidEtfSymbols, analyzeEMA36Etf);

    // Filter out null results
    const results = allResults.filter((result): result is EMA36Result => result !== null);

    console.log(`✅ Found ${results.length} ETF pullback candidates out of ${liquidEtfSymbols.length}`);

    return results;
}
