import { fetchHistoricalData } from '../utils/fetchData';
import { EMA36Result } from '../types';
import { calculateIndicators } from '../utils/indicators';
import { nifty50Symbols, processWithConcurrency } from '../utils/common';

// Configuration
const CONFIG = {
    EMA_PERIOD: 36,
    MIN_DATA_POINTS: 50,  // Need at least 50 weeks for reliable EMA
    APPROACHING_BREAKOUT_THRESHOLD: 2 // Max distance below EMA for approaching breakout (2%)
};

/**
 * Analyzes a single stock for EMA36 status
 */
async function analyzeEMA36Stock(symbol: string): Promise<EMA36Result | null> {
    try {
        // Fetch ~3 years of weekly historical data (156 weeks ≈ 3 years)
        const rawData = await fetchHistoricalData(symbol, 1095, '1wk'); // 3 years in days

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
                percentDiff
            };
        }

        return null;
    } catch (error) {
        console.error(`Error analyzing ${symbol} for EMA36:`, error);
        return null;
    }
}

/**
 * Analyzes Nifty50 stocks for EMA36 signals
 * @returns {Promise<EMA36Result[]>} Array of stocks below or near 36EMA
 */
export async function analyzeNifty50EMA36(): Promise<EMA36Result[]> {
    console.log('📊 Analyzing Nifty50 stocks for EMA36 signals...');

    // Analyze each stock with concurrency control to avoid rate limits
    const allResults = await processWithConcurrency(nifty50Symbols, analyzeEMA36Stock);

    // Filter out null results
    const results = allResults.filter((result): result is EMA36Result => result !== null);

    console.log(`✅ Found ${results.length} stocks with EMA36 signals out of ${nifty50Symbols.length}`);

    return results;
}
