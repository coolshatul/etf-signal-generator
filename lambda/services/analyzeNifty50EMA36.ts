import { fetchHistoricalData } from '../utils/fetchData';
import { EMA36Result } from '../types';
import { EMA } from 'technicalindicators';

// Nifty50 symbols (excluding NIFTY index)
const nifty50Symbols = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV',
    'BEL', 'BHARTIARTL', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH',
    'HDFCBANK', 'HDFCLIFE', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN',
    'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN', 'SUNPHARMA', 'TCS', 'TATACONSUM', 'TMPV',
    'TATASTEEL', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'
];

// Configuration
const CONFIG = {
    EMA_PERIOD: 36,
    MIN_DATA_POINTS: 50,  // Need at least 50 weeks for reliable EMA
    APPROACHING_BREAKOUT_THRESHOLD: 2, // Max distance below EMA for approaching breakout (2%)
    API_DELAY_MS: 100  // Delay between API calls
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

        // Extract closing prices
        const closes = rawData.map(d => d.close);

        // Calculate 36-period EMA on all available weekly data (should be sufficient)
        const ema36Values = EMA.calculate({ period: CONFIG.EMA_PERIOD, values: closes });

        if (!ema36Values.length) {
            return null;
        }

        const ema36 = ema36Values[ema36Values.length - 1];
        const ltp = closes[closes.length - 1];

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

    const results: EMA36Result[] = [];

    // Analyze each stock with delay to avoid rate limits
    for (const symbol of nifty50Symbols) {
        const result = await analyzeEMA36Stock(symbol);
        if (result) {
            results.push(result);
        }

        // Delay between API calls
        if (CONFIG.API_DELAY_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.API_DELAY_MS));
        }
    }

    console.log(`✅ Found ${results.length} stocks with EMA36 signals out of ${nifty50Symbols.length}`);

    return results;
}
