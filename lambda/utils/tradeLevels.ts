// Trade-level validation shared by all scanners.
//
// The previous bullish scanner subtracted an ATR buffer from the higher of
// swing-low / EMA50 without checking the result. A stock below EMA50 could
// therefore produce a stop *above* the entry with zero risk and an R:R of 0.

export type TradeDirection = 'BUY' | 'SELL';

export interface TradeLevels {
    direction: TradeDirection;
    entry: number;
    stopLoss: number;
    target: number;
}

export interface TradeLevelOptions {
    minRiskReward?: number;
    minStopPercent?: number;
    maxStopPercent?: number;
}

export interface TradeLevelValidation {
    valid: boolean;
    reason?: string;
    risk: number;
    reward: number;
    riskRewardRatio: number;
    stopPercent: number;
    targetPercent: number;
}

export const DEFAULT_MIN_RISK_REWARD = 1.5;
export const DEFAULT_MIN_STOP_PERCENT = 0.5;
export const DEFAULT_MAX_STOP_PERCENT = 12;

function finitePositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}

/**
 * Validate that a trade has a sane, positive-risk structure.
 *
 * BUY : stop < entry < target
 * SELL: target < entry < stop
 */
export function validateTradeLevels(
    levels: TradeLevels,
    options: TradeLevelOptions = {}
): TradeLevelValidation {
    const minRiskReward = options.minRiskReward ?? DEFAULT_MIN_RISK_REWARD;
    const minStopPercent = options.minStopPercent ?? DEFAULT_MIN_STOP_PERCENT;
    const maxStopPercent = options.maxStopPercent ?? DEFAULT_MAX_STOP_PERCENT;

    const { direction, entry, stopLoss, target } = levels;

    const empty: TradeLevelValidation = {
        valid: false,
        reason: 'missing or non-finite trade levels',
        risk: 0,
        reward: 0,
        riskRewardRatio: 0,
        stopPercent: 0,
        targetPercent: 0,
    };

    if (!finitePositive(entry) || !finitePositive(stopLoss) || !finitePositive(target)) {
        return empty;
    }

    if (direction === 'BUY') {
        if (stopLoss >= entry) {
            return { ...empty, reason: 'stop loss must be below entry for a BUY' };
        }
        if (target <= entry) {
            return { ...empty, reason: 'target must be above entry for a BUY' };
        }
    } else {
        if (stopLoss <= entry) {
            return { ...empty, reason: 'stop loss must be above entry for a SELL' };
        }
        if (target >= entry) {
            return { ...empty, reason: 'target must be below entry for a SELL' };
        }
    }

    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(target - entry);
    const riskRewardRatio = risk > 0 ? reward / risk : 0;
    const stopPercent = (risk / entry) * 100;
    const targetPercent = (reward / entry) * 100;

    if (!Number.isFinite(risk) || risk <= 0) {
        return { ...empty, risk, reward, reason: 'risk must be greater than zero' };
    }

    if (stopPercent < minStopPercent) {
        return {
            valid: false,
            reason: `stop distance ${stopPercent.toFixed(2)}% is below the ${minStopPercent}% minimum`,
            risk,
            reward,
            riskRewardRatio,
            stopPercent,
            targetPercent,
        };
    }

    if (stopPercent > maxStopPercent) {
        return {
            valid: false,
            reason: `stop distance ${stopPercent.toFixed(2)}% is above the ${maxStopPercent}% maximum`,
            risk,
            reward,
            riskRewardRatio,
            stopPercent,
            targetPercent,
        };
    }

    if (riskRewardRatio < minRiskReward) {
        return {
            valid: false,
            reason: `reward:risk ${riskRewardRatio.toFixed(2)} is below the ${minRiskReward} minimum`,
            risk,
            reward,
            riskRewardRatio,
            stopPercent,
            targetPercent,
        };
    }

    return {
        valid: true,
        risk,
        reward,
        riskRewardRatio,
        stopPercent,
        targetPercent,
    };
}
