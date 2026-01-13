import { fetchHistoricalData } from '../utils/fetchData';
import { EMACrossoverResult } from '../types';
import { calculateIndicators } from '../utils/indicators';
import { nifty50Symbols, niftyNext50Symbols, processWithConcurrency } from '../utils/common';

// Configuration
const CONFIG = {
    MIN_DATA_POINTS: 100,  // Need sufficient data for reliable EMAs
    PROXIMITY_THRESHOLD: 0.015, // 1.5%
    RSI_BULLISH_MIN: 45,
    RSI_BEARISH_MAX: 55,
    LOOKBACK_PERIODS: 5,   // Look back 5 candles for a crossover
    RISK_REWARD_RATIO: 2.0,
};

type Timeframe = '15m' | '1h' | '1d' | '1wk';

/**
 * Analyzes a single stock for EMA cascade crossover with price proximity and momentum filters
 */
async function analyzeEMACrossoverStock(
    symbol: string,
    timeframe: Timeframe = '15m'
): Promise<EMACrossoverResult | null> {
    try {
        // Map timeframe to days to fetch
        const daysToFetch = timeframe === '1wk' ? 1000 : timeframe === '1d' ? 365 : 30;

        const rawData = await fetchHistoricalData(symbol, daysToFetch, timeframe);
        if (!rawData.length || rawData.length < CONFIG.MIN_DATA_POINTS) {
            return null;
        }

        // Calculate indicators using unified utility
        const dataWithIndicators = calculateIndicators(rawData);
        const lastIndex = dataWithIndicators.length - 1;
        const last = dataWithIndicators[lastIndex];

        const { close: price, ema9, ema15, ema50, rsi } = last;

        // Ensure current indicators are available
        if (ema9 === null || ema15 === null || ema50 === null || rsi === null) {
            return null;
        }

        // 1. Check for Bullish/Bearish EMA Cascade Structure (EMA9 > EMA15 > EMA50 or reverse)
        const isBullishStructure = ema9 > ema15 && ema15 > ema50;
        const isBearishStructure = ema9 < ema15 && ema15 < ema50;

        if (!isBullishStructure && !isBearishStructure) {
            return null;
        }

        // 2. Trend Confirmation (EMA50 Slope over last few candles)
        const prevEMA50 = dataWithIndicators[lastIndex - 3]?.ema50;
        if (prevEMA50 === null) return null;
        const isTrendBullish = ema50 > prevEMA50;
        const isTrendBearish = ema50 < prevEMA50;

        // 3. Detect RECENT crossover within lookback period
        let hasRecentCrossover = false;
        const lookbackStart = Math.max(1, lastIndex - CONFIG.LOOKBACK_PERIODS);

        for (let i = lastIndex; i > lookbackStart; i--) {
            const current = dataWithIndicators[i];
            const previous = dataWithIndicators[i - 1];

            if (isBullishStructure) {
                if (previous.ema9 <= previous.ema15 && current.ema9 > current.ema15) {
                    hasRecentCrossover = true;
                    break;
                }
            } else if (isBearishStructure) {
                if (previous.ema9 >= previous.ema15 && current.ema9 < current.ema15) {
                    hasRecentCrossover = true;
                    break;
                }
            }
        }

        if (!hasRecentCrossover) return null;

        // 4. Momentum Filter (RSI)
        if (isBullishStructure && rsi < CONFIG.RSI_BULLISH_MIN) return null;
        if (isBearishStructure && rsi > CONFIG.RSI_BEARISH_MAX) return null;

        // 5. Check if price is within threshold of fast EMAs (Pullback Check)
        const priceNearEMA9 = Math.abs(price - ema9) / ema9 <= CONFIG.PROXIMITY_THRESHOLD;
        const priceNearEMA15 = Math.abs(price - ema15) / ema15 <= CONFIG.PROXIMITY_THRESHOLD;
        const priceNearTrendEMA = priceNearEMA9 || priceNearEMA15;

        // Only signal if structure is correct AND fresh cross found AND price is near the fast EMA levels
        if (priceNearTrendEMA) {
            const crossoverType = isBullishStructure ? 'BULLISH' : 'BEARISH';
            if (crossoverType === 'BULLISH' && !isTrendBullish) return null;
            if (crossoverType === 'BEARISH' && !isTrendBearish) return null;

            const nearEMAs = [];
            if (priceNearEMA9) nearEMAs.push('EMA9');
            if (priceNearEMA15) nearEMAs.push('EMA15');

            // 6. Calculate actionable levels
            const stopLoss = isBullishStructure
                ? Math.min(ema50, last.low * 0.99)
                : Math.max(ema50, last.high * 1.01);

            const risk = Math.abs(price - stopLoss);
            const target = isBullishStructure
                ? price + (risk * CONFIG.RISK_REWARD_RATIO)
                : price - (risk * CONFIG.RISK_REWARD_RATIO);

            return {
                symbol,
                price,
                ema9,
                ema15,
                ema50,
                rsi,
                stopLoss,
                target,
                crossoverType,
                signal: `Recent ${crossoverType.toLowerCase()} EMA cross on ${timeframe} with ${rsi.toFixed(1)} RSI. Price near ${nearEMAs.join(', ')}.`
            };
        }

        return null;
    } catch (error) {
        console.error(`Error analyzing ${symbol} for EMA crossover:`, error);
        return null;
    }
}

/**
 * Analyzes Nifty50 and Nifty Next 50 stocks for EMA cascade crossover signals
 * @param timeframe Time interval for analysis (default: '15m')
 * @returns {Promise<EMACrossoverResult[]>} Array of stocks with EMA crossover signals
 */
export async function analyzeNifty50EMACrossover(timeframe: Timeframe = '15m'): Promise<EMACrossoverResult[]> {
    console.log(`📊 Analyzing Nifty50 + Next50 stocks for EMA cascade crossover signals on ${timeframe} timeframe...`);

    const allSymbols = [...nifty50Symbols, ...niftyNext50Symbols];

    // Analyze each stock with concurrency control to avoid rate limits
    const allResults = await processWithConcurrency(allSymbols, (symbol) => analyzeEMACrossoverStock(symbol, timeframe));

    // Filter out null results
    const results = allResults.filter((result): result is EMACrossoverResult => result !== null);

    console.log(`✅ Found ${results.length} stocks with EMA cascade crossover signals out of ${allSymbols.length}`);

    return results;
}
