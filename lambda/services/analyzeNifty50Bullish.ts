import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { BullishStockResult } from '../types';
import { EMA, RSI, MACD, ATR } from 'technicalindicators';
import { nifty50Symbols, processWithConcurrency } from '../utils/common';

// Configuration constants
const CONFIG = {
    ATR_PERIOD: 14,
    ATR_MULTIPLIER: 1.5,
    SWING_DAYS: 50,
    MIN_DATA_POINTS: 100,
    RSI_MIN: 40,
    RSI_MAX: 60,
    BULLISH_THRESHOLD: 5
};

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

// Function to calculate stop-loss and target levels
function calculateLevels(lastClose: number, swingLow: number, swingHigh: number, ema50: number, atr: number) {
    // Improved stop-loss: Below swing low or EMA50 (whichever is higher), minus ATR multiplier for buffer
    const baseStopLevel = Math.max(swingLow, ema50);
    const stopLoss = Math.max(0, baseStopLevel - (atr * CONFIG.ATR_MULTIPLIER));
    const stopLossPercent = lastClose > 0 ? ((stopLoss - lastClose) / lastClose) * 100 : 0;

    // Improved target: Aim for 2:1 risk-reward using ATR, or swing high + 5% buffer
    const riskAmount = Math.max(0, lastClose - stopLoss);
    const target = Math.max(lastClose + (riskAmount * 2), swingHigh * 1.05);
    const targetPercent = lastClose > 0 ? ((target - lastClose) / lastClose) * 100 : 0;

    // Calculate risk-reward ratio
    const denominator = lastClose - stopLoss;
    const riskRewardRatio = denominator > 0 ? Math.max(0, (target - lastClose) / denominator) : 0;

    return { stopLoss, target, stopLossPercent, targetPercent, riskRewardRatio, baseStopLevel };
}

// Function to evaluate bullish conditions
function evaluateBullish(indicators: any, swingLow: number, swingHigh: number) {
    const {
        ema10, ema20, ema50, prevEMA20, prevEMA50,
        rsi, macdHistogram, lastClose, prevClose, prevPrevClose,
        volume, avgVolume20, obv, prevObv
    } = indicators;

    // Trend Analysis
    const isUptrend = lastClose > prevClose;
    const isAboveEMA10 = lastClose > ema10;
    const isAboveEMA20 = lastClose > ema20;
    const isAboveEMA50 = lastClose > ema50;

    // Early exit conditions
    if (!isUptrend) return { isBullish: false, rating: 0, signals: [] };

    if (!isAboveEMA10 && !isAboveEMA20) return { isBullish: false, rating: 0, signals: [] };

    if (prevPrevClose !== null && lastClose <= prevPrevClose) return { isBullish: false, rating: 0, signals: [] };

    // EMA Structure
    const isStackedBullish = ema20 > ema50;
    const ema20Above50 = ema20 > ema50 && prevEMA20 <= prevEMA50;

    // Momentum
    const rsiInRange = rsi >= CONFIG.RSI_MIN && rsi <= CONFIG.RSI_MAX;
    const macdPositive = macdHistogram > 0;

    // Volume Analysis
    const isHighVolume = volume > avgVolume20;
    const isObvRising = obv > prevObv;

    // Simplified bullish rating (up to 10 points)
    let rating = 0;
    const signals = [];

    if (isAboveEMA20) {
        rating += 2;
        signals.push('Price above EMA20');
    }

    if (isAboveEMA50) {
        rating += 1;
        signals.push('Price above EMA50');
    }

    if (isStackedBullish) {
        rating += 2;
        signals.push('EMA20 > EMA50');
    }

    if (ema20Above50) {
        rating += 2;
        signals.push('EMA20 cross above EMA50');
    }

    if (rsiInRange && macdPositive) {
        rating += 1;
        signals.push('RSI in range and MACD positive');
    }

    if (isHighVolume) {
        rating += 1;
        signals.push('High volume confirmation');
    }

    if (isObvRising) {
        rating += 1;
        signals.push('OBV trending up');
    }

    const isBullish = rating >= CONFIG.BULLISH_THRESHOLD;

    return { isBullish, rating, signals };
}

// Analyze a single stock for bullish signals
async function analyzeBullishStock(symbol: string): Promise<BullishStockResult> {
    try {
        // Fetch historical data (200 days for sufficient data)
        const rawData = await fetchHistoricalData(symbol, 200);
        if (!rawData.length || rawData.length < CONFIG.MIN_DATA_POINTS) {
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

        // Early validation
        if (lastClose <= 0 || prevClose <= 0) {
            return getDefaultResponse(symbol);
        }

        // Calculate swing levels
        const swingDays = Math.min(CONFIG.SWING_DAYS, dataWithIndicators.length);
        const recentData = dataWithIndicators.slice(-swingDays);
        const swingLow = Math.min(...recentData.map(d => d.low));
        const swingHigh = Math.max(...recentData.map(d => d.high));

        // Calculate levels
        const levels = calculateLevels(lastClose, swingLow, swingHigh, ema50, atr);

        // Evaluate bullish conditions
        const indicators = {
            ema10, ema20, ema50, prevEMA20, prevEMA50, rsi, macdHistogram, lastClose, prevClose,
            prevPrevClose: prevPrevCandle ? prevPrevCandle.close : null,
            volume, avgVolume20, obv, prevObv
        };
        const bullishResult = evaluateBullish(indicators, swingLow, swingHigh);

        return {
            symbol,
            price: lastClose,
            ...bullishResult,
            ...levels,
            swingLow,
            swingHigh
        };
    } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        return getDefaultResponse(symbol);
    }
}

import { getMarketRegime } from './marketRegime';

/**
 * Analyzes Nifty50 stocks for bullish signals based on EMA strategy.
 * @returns {Promise<BullishStockResult[]>} Array of bullish stock results
 */
export async function analyzeNifty50Bullish(): Promise<BullishStockResult[]> {
    console.log('📊 Analyzing Nifty50 stocks for bullish signals...');

    // Get overall market regime first
    const marketRegime = await getMarketRegime();
    console.log(`🌍 Market Regime: ${marketRegime.isBullish ? 'BULLISH' : 'BEARISH'} (${marketRegime.trend})`);

    // Analyze each stock with concurrency control to avoid rate limits
    const results = await processWithConcurrency(nifty50Symbols, analyzeBullishStock);

    // Filter to bullish stocks only
    let bullishResults = results.filter(r => r.isBullish);

    // Filter based on market regime (Don't suppress, just flag)
    bullishResults = bullishResults.map(r => ({
        ...r,
        marketRegimeBullish: marketRegime.isBullish
    }));

    console.log(`✅ Found ${bullishResults.length} bullish stocks out of ${nifty50Symbols.length}`);

    return bullishResults;
}
