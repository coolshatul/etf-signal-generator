import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { BullishStockResult } from '../types';
import { EMA, RSI, MACD, ATR } from 'technicalindicators';

// Configuration constants
const CONFIG = {
    ATR_PERIOD: 14,
    ATR_MULTIPLIER: 1.5,
    SWING_DAYS: 50,
    MIN_DATA_POINTS: 100,
    RSI_MIN: 40,
    RSI_MAX: 60,
    BULLISH_THRESHOLD: 5,
    API_DELAY_MS: 100  // Delay between API calls to avoid rate limits
};

// Nifty50 symbols (excluding NIFTY index)
const nifty50Symbols = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV',
    'BEL', 'BHARTIARTL', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH',
    'HDFCBANK', 'HDFCLIFE', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN',
    'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN', 'SUNPHARMA', 'TCS', 'TATACONSUM', 'TMPV',
    'TATASTEEL', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'
];

// Helper function for default response
function getDefaultResponse(symbol: string): BullishStockResult {
    return {
        symbol,
        isBullish: false,
        rating: 0,
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

// Function to calculate additional indicators
function calculateAdditionalIndicators(closes: number[], highs: number[], lows: number[]) {
    // Calculate EMAs
    const ema10Values = EMA.calculate({ period: 10, values: closes });
    const ema20Values = EMA.calculate({ period: 20, values: closes });
    const ema50Values = EMA.calculate({ period: 50, values: closes });

    const ema10 = ema10Values[ema10Values.length - 1];
    const ema20 = ema20Values[ema20Values.length - 1];
    const ema50 = ema50Values[ema50Values.length - 1];

    const prevEMA20 = ema20Values[ema20Values.length - 2];
    const prevEMA50 = ema50Values[ema50Values.length - 2];

    // Calculate ATR
    let atr = 0;
    if (closes.length >= CONFIG.ATR_PERIOD + 1) {
        const atrValues = ATR.calculate({ period: CONFIG.ATR_PERIOD, high: highs, low: lows, close: closes });
        atr = atrValues[atrValues.length - 1] || 0;
    }

    // Calculate RSI and MACD
    const rsiValues = RSI.calculate({ period: 14, values: closes });
    const rsi = rsiValues[rsiValues.length - 1];

    const macdResult = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false
    });
    const macdHistogram = macdResult[macdResult.length - 1].histogram;

    return {
        ema10, ema20, ema50, prevEMA20, prevEMA50, atr, rsi, macdHistogram,
        lastClose: closes[closes.length - 1],
        prevClose: closes[closes.length - 2],
        prevPrevClose: closes.length >= 3 ? closes[closes.length - 3] : null
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
    const { ema10, ema20, ema50, prevEMA20, prevEMA50, rsi, macdHistogram, lastClose, prevClose, prevPrevClose } = indicators;

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

    // Simplified bullish rating (up to 8 points)
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

    // // Add the 2-day check to signals since it's a prerequisite
    // if (prevPrevClose !== null) {
    //     signals.push('Price higher than 2 days ago');
    // }

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

        // Calculate indicators using existing utils (for basic ones)
        const dataWithIndicators = calculateIndicators(rawData, 14, 9, 21); // rsi, ema9, ema21

        // Extract arrays
        const closes = rawData.map(d => d.close);
        const highs = rawData.map(d => d.high);
        const lows = rawData.map(d => d.low);

        // Calculate additional indicators
        const indicators = calculateAdditionalIndicators(closes, highs, lows);

        // Early validation
        if (indicators.lastClose <= 0 || indicators.prevClose <= 0) {
            return getDefaultResponse(symbol);
        }

        // Calculate swing levels
        const swingDays = Math.min(CONFIG.SWING_DAYS, rawData.length);
        let swingLow, swingHigh;
        if (swingDays < 2) {
            swingLow = lows[lows.length - 1];
            swingHigh = highs[highs.length - 1];
        } else {
            swingLow = Math.min(...lows.slice(-swingDays));
            swingHigh = Math.max(...highs.slice(-swingDays));
        }

        // Calculate levels
        const levels = calculateLevels(indicators.lastClose, swingLow, swingHigh, indicators.ema50, indicators.atr);

        // Evaluate bullish conditions
        const bullishResult = evaluateBullish(indicators, swingLow, swingHigh);

        return {
            symbol,
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

/**
 * Analyzes Nifty50 stocks for bullish signals based on EMA strategy.
 * @returns {Promise<BullishStockResult[]>} Array of bullish stock results
 */
export async function analyzeNifty50Bullish(): Promise<BullishStockResult[]> {
    console.log('📊 Analyzing Nifty50 stocks for bullish signals...');

    const results: BullishStockResult[] = [];

    // Analyze each stock with delay to avoid rate limits
    for (const symbol of nifty50Symbols) {
        const result = await analyzeBullishStock(symbol);
        results.push(result);

        // Delay between API calls
        if (CONFIG.API_DELAY_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.API_DELAY_MS));
        }
    }

    // Filter to bullish stocks only
    const bullishResults = results.filter(r => r.isBullish);

    console.log(`✅ Found ${bullishResults.length} bullish stocks out of ${nifty50Symbols.length}`);

    return bullishResults;
}
