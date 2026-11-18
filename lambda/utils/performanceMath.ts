// Performance math: costs, corporate-action adjustment, and gap detection.
// Kept pure and network-free so it can be unit tested deterministically.

export interface CostModel {
    /** Round-trip delivery costs: brokerage, STT, exchange, GST, stamp duty. */
    roundTripCostPercent: number;
    /** Slippage allowance per side, in basis points (1 bp = 0.01%). */
    slippageBpsPerSide: number;
}

export const DEFAULT_COST_MODEL: CostModel = {
    roundTripCostPercent: 0.35,
    slippageBpsPerSide: 5,
};

export interface PerformanceResult {
    grossPercent: number;
    netPercent: number;
    costPercent: number;
}

/**
 * Gross and net percentage return for a long or short position.
 * Costs are subtracted once for the full round trip, plus slippage on both
 * sides.
 */
export function computePerformance(
    direction: 'BUY' | 'SELL',
    entry: number,
    exit: number,
    costs: CostModel = DEFAULT_COST_MODEL
): PerformanceResult {
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit)) {
        return { grossPercent: 0, netPercent: 0, costPercent: 0 };
    }

    const grossPercent =
        direction === 'SELL'
            ? ((entry - exit) / entry) * 100
            : ((exit - entry) / entry) * 100;

    const costPercent =
        costs.roundTripCostPercent + (costs.slippageBpsPerSide / 100) * 2;

    return {
        grossPercent,
        netPercent: grossPercent - costPercent,
        costPercent,
    };
}

export interface SplitEvent {
    /** ISO timestamp of the split. */
    date: string;
    numerator: number;
    denominator: number;
    /** numerator / denominator. A 2:1 split has ratio 2. */
    ratio: number;
}

/**
 * Cumulative split ratio for splits that happened after entry.
 * A stored pre-split price is converted into post-split terms by dividing by
 * this ratio.
 */
export function cumulativeSplitRatio(splits: SplitEvent[], entryAt: Date): number {
    return splits
        .filter(split => {
            const splitAt = new Date(split.date);
            return (
                !Number.isNaN(splitAt.getTime()) &&
                splitAt.getTime() > entryAt.getTime() &&
                Number.isFinite(split.ratio) &&
                split.ratio > 0
            );
        })
        .reduce((ratio, split) => ratio * split.ratio, 1);
}

export interface AdjustedLevels {
    entry: number;
    stopLoss?: number;
    target?: number;
}

export function adjustLevelsForSplits(
    entry: number,
    stopLoss: number | undefined,
    target: number | undefined,
    ratio: number
): AdjustedLevels | null {
    if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(entry)) {
        return null;
    }

    return {
        entry: entry / ratio,
        stopLoss:
            stopLoss != null && Number.isFinite(stopLoss) ? stopLoss / ratio : undefined,
        target: target != null && Number.isFinite(target) ? target / ratio : undefined,
    };
}

export interface GapDetection {
    found: boolean;
    from?: string;
    to?: string;
    changePercent?: number;
}

/**
 * Detect a large unexplained close-to-close gap. Used as a fallback when split
 * events are unavailable: a gap this large is far more likely to be a
 * corporate action than a tradable move, and must not trigger a false stop.
 */
export function detectUnexplainedGap(
    candles: Array<{ date: string; close: number }>,
    thresholdPercent = 35
): GapDetection {
    for (let i = 1; i < candles.length; i++) {
        const previous = candles[i - 1];
        const current = candles[i];
        if (
            !previous ||
            !current ||
            !Number.isFinite(previous.close) ||
            !Number.isFinite(current.close) ||
            previous.close <= 0
        ) {
            continue;
        }

        const changePercent = ((current.close - previous.close) / previous.close) * 100;
        if (Math.abs(changePercent) >= thresholdPercent) {
            return {
                found: true,
                from: previous.date,
                to: current.date,
                changePercent,
            };
        }
    }

    return { found: false };
}
