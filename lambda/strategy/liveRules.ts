// Live entry rules, extracted so the scanners and the backtester share one
// implementation. Nothing in this file performs I/O.
//
// The previous backtest engine used a different rule set (RSI 3-day uptrend,
// EMA9/21, MACD) from the scanners, so its headline numbers described a
// strategy that was never traded. Any new rule belongs here first, and both
// the scanner and the backtest get it.

import { CandleWithIndicators } from '../types';
import {
    TradeLevelOptions,
    TradeLevelValidation,
    validateTradeLevels,
} from '../utils/tradeLevels';

export const BULLISH_RULES = {
    ATR_PERIOD: 14,
    ATR_MULTIPLIER: 1.5,
    SWING_DAYS: 50,
    MIN_DATA_POINTS: 100,
    RSI_MIN: 40,
    RSI_MAX: 60,
    BULLISH_THRESHOLD: 5,
    /** Target is the larger of 2R or swing-high + 5%. */
    TARGET_R_MULTIPLE: 2,
    SWING_HIGH_BUFFER: 1.05,
} as const;

export const CROSSOVER_RULES = {
    MIN_DATA_POINTS: 100,
    PROXIMITY_THRESHOLD: 0.015,
    RSI_BULLISH_MIN: 45,
    RSI_BEARISH_MAX: 55,
    LOOKBACK_PERIODS: 5,
    RISK_REWARD_RATIO: 2.0,
    /** EMA50 slope is measured over this many bars back. */
    SLOPE_LOOKBACK: 3,
} as const;

export interface BullishInputs {
    ema10: number | null;
    ema20: number | null;
    ema50: number | null;
    prevEMA20: number | null;
    prevEMA50: number | null;
    rsi: number | null;
    macdHistogram: number | null;
    lastClose: number;
    prevClose: number;
    prevPrevClose: number | null;
    volume: number;
    avgVolume20: number | null;
    obv: number | null;
    prevObv: number | null;
}

export interface BullishEvaluation {
    isBullish: boolean;
    rating: number;
    signals: string[];
    /** Set when an early filter stopped evaluation, for backtest diagnostics. */
    blockedBy?: string;
}

export interface BullishLevels {
    stopLoss: number;
    target: number;
    stopLossPercent: number;
    targetPercent: number;
    riskRewardRatio: number;
    baseStopLevel: number;
}

/**
 * Bullish scan scoring. Identical to the live scanner: trend and EMA gates
 * first, then a 10-point score with a threshold of 5.
 */
export interface BullishRuleOverrides {
    /** Minimum score required to emit a signal (default 5). */
    threshold?: number;
    rsiMin?: number;
    rsiMax?: number;
}

export function evaluateBullishEntry(
    input: BullishInputs,
    overrides: BullishRuleOverrides = {}
): BullishEvaluation {
    const threshold = overrides.threshold ?? BULLISH_RULES.BULLISH_THRESHOLD;
    const rsiMin = overrides.rsiMin ?? BULLISH_RULES.RSI_MIN;
    const rsiMax = overrides.rsiMax ?? BULLISH_RULES.RSI_MAX;
    const {
        ema10,
        ema20,
        ema50,
        prevEMA20,
        prevEMA50,
        rsi,
        macdHistogram,
        lastClose,
        prevClose,
        prevPrevClose,
        volume,
        avgVolume20,
        obv,
        prevObv,
    } = input;

    if (ema10 == null || ema20 == null || ema50 == null || rsi == null) {
        return { isBullish: false, rating: 0, signals: [], blockedBy: 'warmup' };
    }
    if (macdHistogram == null || obv == null || prevObv == null) {
        return { isBullish: false, rating: 0, signals: [], blockedBy: 'warmup' };
    }
    if (prevEMA20 == null || prevEMA50 == null || avgVolume20 == null) {
        return { isBullish: false, rating: 0, signals: [], blockedBy: 'warmup' };
    }

    // Trend Analysis
    const isUptrend = lastClose > prevClose;
    if (!isUptrend) {
        return {
            isBullish: false,
            rating: 0,
            signals: [],
            blockedBy: 'not up vs previous close',
        };
    }

    const isAboveEMA10 = lastClose > ema10;
    const isAboveEMA20 = lastClose > ema20;
    const isAboveEMA50 = lastClose > ema50;

    if (!isAboveEMA10 && !isAboveEMA20) {
        return {
            isBullish: false,
            rating: 0,
            signals: [],
            blockedBy: 'below EMA10 and EMA20',
        };
    }

    if (prevPrevClose !== null && lastClose <= prevPrevClose) {
        return {
            isBullish: false,
            rating: 0,
            signals: [],
            blockedBy: 'no higher low vs 2 bars back',
        };
    }

    // EMA Structure
    const isStackedBullish = ema20 > ema50;
    const ema20Above50 = ema20 > ema50 && prevEMA20 <= prevEMA50;

    // Momentum
    const rsiInRange = rsi >= rsiMin && rsi <= rsiMax;
    const macdPositive = macdHistogram > 0;

    // Volume Analysis
    const isHighVolume = volume > avgVolume20;
    const isObvRising = obv > prevObv;

    let rating = 0;
    const signals: string[] = [];

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

    return {
        isBullish: rating >= threshold,
        rating,
        signals,
    };
}

/**
 * Stop below the higher of swing low and EMA50, minus an ATR buffer.
 * Target is the larger of 2R and swing high + 5%.
 */
export function calculateBullishLevels(
    lastClose: number,
    swingLow: number,
    swingHigh: number,
    ema50: number,
    atr: number,
    overrides: { targetRMultiple?: number; swingHighBuffer?: number } = {}
): BullishLevels {
    const targetRMultiple =
        overrides.targetRMultiple ?? BULLISH_RULES.TARGET_R_MULTIPLE;
    const swingHighBuffer =
        overrides.swingHighBuffer ?? BULLISH_RULES.SWING_HIGH_BUFFER;

    const baseStopLevel = Math.max(swingLow, ema50);
    const stopLoss = Math.max(
        0,
        baseStopLevel - atr * BULLISH_RULES.ATR_MULTIPLIER
    );
    const stopLossPercent =
        lastClose > 0 ? ((stopLoss - lastClose) / lastClose) * 100 : 0;

    const riskAmount = Math.max(0, lastClose - stopLoss);
    const target = Math.max(
        lastClose + riskAmount * targetRMultiple,
        swingHigh * swingHighBuffer
    );
    const targetPercent =
        lastClose > 0 ? ((target - lastClose) / lastClose) * 100 : 0;

    const denominator = lastClose - stopLoss;
    const riskRewardRatio =
        denominator > 0 ? Math.max(0, (target - lastClose) / denominator) : 0;

    return {
        stopLoss,
        target,
        stopLossPercent,
        targetPercent,
        riskRewardRatio,
        baseStopLevel,
    };
}

export interface CrossoverEvaluation {
    direction: 'BUY' | 'SELL' | null;
    reason?: string;
    price?: number;
    ema9?: number;
    ema15?: number;
    ema50?: number;
    rsi?: number;
    stopLoss?: number;
    target?: number;
    crossedAt?: string;
    nearEMAs?: string[];
    levelValidation?: TradeLevelValidation;
}

/**
 * EMA cascade crossover evaluation at a given bar. Mirrors the live scanner
 * step for step: structure, EMA50 slope, recent cross, RSI filter, proximity
 * to the fast EMAs, then trade-level validation.
 */
export function evaluateCrossoverAt(
    rows: CandleWithIndicators[],
    lastIndex: number,
    riskLimits: TradeLevelOptions
): CrossoverEvaluation {
    const last = rows[lastIndex];
    if (!last) return { direction: null, reason: 'no candle' };

    const { close: price, ema9, ema15, ema50, rsi } = last;

    if (ema9 == null || ema15 == null || ema50 == null || rsi == null) {
        return { direction: null, reason: 'warmup' };
    }

    const isBullishStructure = ema9 > ema15 && ema15 > ema50;
    const isBearishStructure = ema9 < ema15 && ema15 < ema50;

    if (!isBullishStructure && !isBearishStructure) {
        return { direction: null, reason: 'no EMA cascade' };
    }

    const prevEMA50 =
        rows[lastIndex - CROSSOVER_RULES.SLOPE_LOOKBACK]?.ema50 ?? null;
    if (prevEMA50 == null) return { direction: null, reason: 'warmup' };

    const isTrendBullish = ema50 > prevEMA50;
    const isTrendBearish = ema50 < prevEMA50;

    let hasRecentCrossover = false;
    let crossedAt: string | null = null;
    const lookbackStart = Math.max(1, lastIndex - CROSSOVER_RULES.LOOKBACK_PERIODS);

    for (let i = lastIndex; i > lookbackStart; i--) {
        const current = rows[i];
        const previous = rows[i - 1];
        if (!current || !previous) continue;
        if (
            current.ema9 == null ||
            current.ema15 == null ||
            previous.ema9 == null ||
            previous.ema15 == null
        ) {
            continue;
        }

        if (isBullishStructure) {
            if (previous.ema9 <= previous.ema15 && current.ema9 > current.ema15) {
                hasRecentCrossover = true;
                crossedAt = current.date;
                break;
            }
        } else if (isBearishStructure) {
            if (previous.ema9 >= previous.ema15 && current.ema9 < current.ema15) {
                hasRecentCrossover = true;
                crossedAt = current.date;
                break;
            }
        }
    }

    if (!hasRecentCrossover) {
        return { direction: null, reason: 'no recent cross' };
    }

    if (isBullishStructure && rsi < CROSSOVER_RULES.RSI_BULLISH_MIN) {
        return { direction: null, reason: 'RSI below bullish minimum' };
    }
    if (isBearishStructure && rsi > CROSSOVER_RULES.RSI_BEARISH_MAX) {
        return { direction: null, reason: 'RSI above bearish maximum' };
    }

    const priceNearEMA9 =
        Math.abs(price - ema9) / ema9 <= CROSSOVER_RULES.PROXIMITY_THRESHOLD;
    const priceNearEMA15 =
        Math.abs(price - ema15) / ema15 <= CROSSOVER_RULES.PROXIMITY_THRESHOLD;

    if (!priceNearEMA9 && !priceNearEMA15) {
        return { direction: null, reason: 'price not near fast EMAs' };
    }

    if (isBullishStructure && !isTrendBullish) {
        return { direction: null, reason: 'EMA50 slope not rising' };
    }
    if (isBearishStructure && !isTrendBearish) {
        return { direction: null, reason: 'EMA50 slope not falling' };
    }

    const nearEMAs: string[] = [];
    if (priceNearEMA9) nearEMAs.push('EMA9');
    if (priceNearEMA15) nearEMAs.push('EMA15');

    const stopLoss = isBullishStructure
        ? Math.min(ema50, last.low * 0.99)
        : Math.max(ema50, last.high * 1.01);

    const risk = Math.abs(price - stopLoss);
    const target = isBullishStructure
        ? price + risk * CROSSOVER_RULES.RISK_REWARD_RATIO
        : price - risk * CROSSOVER_RULES.RISK_REWARD_RATIO;

    const direction = isBullishStructure ? 'BUY' : 'SELL';
    const levelValidation = validateTradeLevels(
        { direction, entry: price, stopLoss, target },
        riskLimits
    );

    if (!levelValidation.valid) {
        return {
            direction: null,
            reason: `levels rejected: ${levelValidation.reason}`,
            levelValidation,
            price,
            ema9,
            ema15,
            ema50,
            rsi,
        };
    }

    return {
        direction,
        price,
        ema9,
        ema15,
        ema50,
        rsi,
        stopLoss,
        target,
        crossedAt: crossedAt ?? last.date,
        nearEMAs,
        levelValidation,
    };
}
