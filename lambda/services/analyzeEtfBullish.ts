import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { BullishStockResult } from '../types';
import { liquidEtfSymbols, processWithConcurrency, LOOKBACK_DAYS } from '../utils/common';
import { validateTradeLevels } from '../utils/tradeLevels';
import { RISK_LIMITS } from '../config/settings';
import {
    BULLISH_RULES,
    calculateBullishLevels,
    evaluateBullishEntry,
} from '../strategy/liveRules';

// Helper function for default response
function getDefaultResponse(symbol: string): BullishStockResult {
    return {
        symbol,
        isBullish: false,
        rating: 0,
        price: 0,
        signals: [],
        stopLoss: 0,
        target: 0,
        stopLossPercent: 0,
        targetPercent: 0,
        riskRewardRatio: 0,
        swingLow: 0,
        swingHigh: 0,
        baseStopLevel: 0
    };
}

// Analyze a single ETF for bullish signals
async function analyzeBullishEtf(symbol: string): Promise<BullishStockResult> {
    try {
        // Fetch historical data with a standardised lookback
        const rawData = await fetchHistoricalData(symbol, LOOKBACK_DAYS.daily);
        if (!rawData.length || rawData.length < BULLISH_RULES.MIN_DATA_POINTS) {
            return getDefaultResponse(symbol);
        }

        // Calculate indicators using unified utility
        const dataWithIndicators = calculateIndicators(rawData);
        const lastCandle = dataWithIndicators[dataWithIndicators.length - 1];
        const prevCandle = dataWithIndicators[dataWithIndicators.length - 2];
        const prevPrevCandle = dataWithIndicators.length >= 3 ? dataWithIndicators[dataWithIndicators.length - 3] : null;

        // Extract necessary indicator values
        const { close: lastClose, ema10, ema20, ema50, rsi, macdHistogram, atr, volume, avgVolume20, obv } = lastCandle;
        const { close: prevClose, ema20: prevEMA20, ema50: prevEMA50, obv: prevObv } = prevCandle;

        // Early validation. Comparisons against null coerce to 0 in JS and can
        // create false "above EMA" signals, so bail out explicitly.
        if (lastClose <= 0 || prevClose <= 0) {
            return getDefaultResponse(symbol);
        }
        if (
            ema10 == null || ema20 == null || ema50 == null ||
            rsi == null || macdHistogram == null || atr == null ||
            avgVolume20 == null || obv == null || prevObv == null ||
            prevEMA20 == null || prevEMA50 == null
        ) {
            return getDefaultResponse(symbol);
        }

        // Calculate swing levels
        const swingDays = Math.min(BULLISH_RULES.SWING_DAYS, dataWithIndicators.length);
        const recentData = dataWithIndicators.slice(-swingDays);
        const swingLow = Math.min(...recentData.map(d => d.low));
        const swingHigh = Math.max(...recentData.map(d => d.high));

        // Calculate levels
        const levels = calculateBullishLevels(lastClose, swingLow, swingHigh, ema50, atr);

        // A high score is not enough: the resulting trade must have a sane
        // stop below both the entry and the invalidation level, positive risk,
        // and an acceptable reward:risk ratio.
        const levelValidation = validateTradeLevels(
            {
                direction: 'BUY',
                entry: lastClose,
                stopLoss: levels.stopLoss,
                target: levels.target,
            },
            {
                minRiskReward: RISK_LIMITS.minRiskReward,
                minStopPercent: RISK_LIMITS.minStopPercent,
                maxStopPercent: RISK_LIMITS.maxStopPercent,
            }
        );

        // Evaluate bullish conditions
        const bullishResult = evaluateBullishEntry({
            ema10, ema20, ema50, prevEMA20, prevEMA50, rsi, macdHistogram, lastClose, prevClose,
            prevPrevClose: prevPrevCandle ? prevPrevCandle.close : null,
            volume, avgVolume20, obv, prevObv
        });

        if (bullishResult.isBullish && !levelValidation.valid) {
            console.log(
                `⚠️ ${symbol}: bullish score ${bullishResult.rating}/10 rejected - ${levelValidation.reason}`
            );
            return {
                symbol,
                price: lastClose,
                ...bullishResult,
                isBullish: false,
                ...levels,
                riskRewardRatio: levelValidation.riskRewardRatio,
                swingLow,
                swingHigh,
                asOf: lastCandle.date,
                rejectionReason: levelValidation.reason,
            };
        }

        return {
            symbol,
            price: lastClose,
            ...bullishResult,
            ...levels,
            riskRewardRatio: levelValidation.riskRewardRatio,
            swingLow,
            swingHigh,
            asOf: lastCandle.date,
        };
    } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        return getDefaultResponse(symbol);
    }
}

import { getMarketRegime } from './marketRegime';

/**
 * Analyzes the ETF universe for bullish signals based on EMA strategy.
 * @returns {Promise<BullishStockResult[]>} Array of bullish results
 */
export async function analyzeEtfBullish(): Promise<BullishStockResult[]> {
    console.log('📊 Analyzing ETFs for bullish signals...');

    // Get overall market regime first
    const marketRegime = await getMarketRegime();
    console.log(`🌍 Market Regime: ${marketRegime.isBullish ? 'BULLISH' : 'BEARISH'} (${marketRegime.trend})`);

    // Analyze each stock with concurrency control to avoid rate limits
    const results = await processWithConcurrency(liquidEtfSymbols, analyzeBullishEtf);

    // Filter to bullish ETFs only
    let bullishResults = results.filter(r => r.isBullish);

    // Surface rejected candidates so weak levels are visible in logs.
    const rejected = results.filter(r => r.rejectionReason);
    if (rejected.length) {
        const reasons = new Map<string, number>();
        for (const result of rejected) {
            const reason = result.rejectionReason ?? 'unknown';
            reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        }
        const summary = [...reasons.entries()]
            .map(([reason, count]) => `${count}x ${reason}`)
            .join('; ');
        console.log(`⚠️ Rejected ${rejected.length} bullish candidates: ${summary}`);
    }

    // Filter based on market regime (Don't suppress, just flag)
    bullishResults = bullishResults.map(r => ({
        ...r,
        marketRegimeBullish: marketRegime.isBullish
    }));

    console.log(`✅ Found ${bullishResults.length} bullish ETFs out of ${liquidEtfSymbols.length}`);

    return bullishResults;
}
