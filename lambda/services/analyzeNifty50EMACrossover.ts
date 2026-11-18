import { fetchHistoricalData } from '../utils/fetchData';
import { EMACrossoverResult } from '../types';
import { calculateIndicators } from '../utils/indicators';
import { nifty50Symbols, niftyNext50Symbols, processWithConcurrency, LOOKBACK_DAYS } from '../utils/common';
import { RISK_LIMITS } from '../config/settings';
import { CROSSOVER_RULES, evaluateCrossoverAt } from '../strategy/liveRules';

type Timeframe = '15m' | '1h' | '1d' | '1wk';

const RISK_LIMITS_FOR_LEVELS = {
    minRiskReward: RISK_LIMITS.minRiskReward,
    minStopPercent: RISK_LIMITS.minStopPercent,
    maxStopPercent: RISK_LIMITS.maxStopPercent,
};

/**
 * Analyzes a single stock for EMA cascade crossover with price proximity and momentum filters
 */
async function analyzeEMACrossoverStock(
    symbol: string,
    timeframe: Timeframe = '15m'
): Promise<EMACrossoverResult | null> {
    try {
        // `fetchHistoricalData` expects a calendar-day lookback. Intraday
        // scans need enough calendar span to survive weekends/holidays, so
        // request 20 days for 15m and 40 days for 1h.
        const lookbackDays = timeframe === '1wk'
            ? LOOKBACK_DAYS.weekly
            : timeframe === '1d'
                ? LOOKBACK_DAYS.daily
                : timeframe === '1h'
                    ? LOOKBACK_DAYS.oneHour
                    : LOOKBACK_DAYS.fifteenMinutes;

        const rawData = await fetchHistoricalData(symbol, lookbackDays, timeframe);
        if (!rawData.length || rawData.length < CROSSOVER_RULES.MIN_DATA_POINTS) {
            return null;
        }

        // Calculate indicators using unified utility
        const dataWithIndicators = calculateIndicators(rawData);
        const lastIndex = dataWithIndicators.length - 1;

        // Structure, slope, cross, RSI, proximity and level checks all live
        // in the shared rules module so the backtest cannot drift.
        const evaluation = evaluateCrossoverAt(
            dataWithIndicators,
            lastIndex,
            RISK_LIMITS_FOR_LEVELS
        );

        if (evaluation.direction == null) {
            if (evaluation.reason?.startsWith('levels rejected')) {
                console.log(
                    `⚠️ ${symbol}: ${timeframe} crossover levels rejected - ${evaluation.levelValidation?.reason}`
                );
            }
            return null;
        }

        const crossoverType =
            evaluation.direction === 'BUY' ? 'BULLISH' : 'BEARISH';

        return {
            symbol,
            price: evaluation.price!,
            ema9: evaluation.ema9!,
            ema15: evaluation.ema15!,
            ema50: evaluation.ema50!,
            rsi: evaluation.rsi,
            stopLoss: evaluation.stopLoss,
            target: evaluation.target,
            crossoverType,
            signal: `Recent ${crossoverType.toLowerCase()} EMA cross on ${timeframe} with ${evaluation.rsi!.toFixed(1)} RSI. Price near ${evaluation.nearEMAs!.join(', ')}.`,
            asOf: dataWithIndicators[lastIndex].date,
            crossedAt: evaluation.crossedAt ?? dataWithIndicators[lastIndex].date,
            timeframe,
        };
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
