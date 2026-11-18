// Aggregated performance reporting for the weekly email.
// Pure aggregation over stored signals; no network access.

import { connectToDatabase } from '../db/connection';
import { normalizeTimeframe } from '../db/mongo';
import { Signal } from '../db/models';
import { SignalTimeframe } from '../types';

export interface TradeSummary {
    symbol: string;
    netPercent: number;
    exitDate: Date | null;
    exitReason: string | null;
}

export interface StrategyPerformance {
    strategy: string;
    timeframe: SignalTimeframe;
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgNetPercent: number | null;
    totalNetPercent: number | null;
    best: TradeSummary | null;
    worst: TradeSummary | null;
    open: number;
}

export interface RecentTrade extends TradeSummary {
    strategy: string;
    timeframe: SignalTimeframe;
    holdingDays: number | null;
}

export interface PerformanceReport {
    periodDays: number;
    from: Date;
    to: Date;
    totalClosed: number;
    totalOpen: number;
    wins: number;
    losses: number;
    winRate: number | null;
    avgNetPercent: number | null;
    best: TradeSummary | null;
    worst: TradeSummary | null;
    strategies: StrategyPerformance[];
    recent: RecentTrade[];
}

const CLOSED_STATUSES = ['HIT_TARGET', 'HIT_SL', 'CLOSED'];

function mean(values: number[]): number | null {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]): number | null {
    if (!values.length) return null;
    return values.reduce((total, value) => total + value, 0);
}

function tradeDate(row: any): Date | null {
    const value = row.exitDate ?? row.lastUpdatedAt ?? null;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Build a report for signals closed in the last `periodDays` calendar days,
 * plus the current open positions. Watchlist rows are excluded because they
 * carry BUY/SELL only when they are executable trades.
 */
export async function buildPerformanceReport(
    periodDays = 7
): Promise<PerformanceReport> {
    await connectToDatabase();

    const to = new Date();
    const from = new Date(to.getTime() - periodDays * 86400000);

    const [closedRows, openRows] = await Promise.all([
        Signal.find({
            signal: { $in: ['BUY', 'SELL'] },
            status: { $in: CLOSED_STATUSES },
            // Rejected entries were never trades.
            exitReason: { $ne: 'ENTRY_INVALID' },
            // Backlog reconciliations are historical, not this week's activity.
            'metadata.backlogClose': { $ne: true },
            $or: [
                { exitDate: { $gte: from } },
                { exitDate: { $exists: false }, lastUpdatedAt: { $gte: from } },
            ],
        }).lean(),
        Signal.find({
            signal: { $in: ['BUY', 'SELL'] },
            status: 'OPEN',
        })
            .select('strategy timeframe')
            .lean(),
    ]);

    const openCounts = new Map<string, number>();
    const groupMeta = new Map<
        string,
        { strategy: string; timeframe: SignalTimeframe; open: number }
    >();

    for (const row of openRows) {
        const timeframe = normalizeTimeframe(row.timeframe, row.strategy);
        const key = `${row.strategy}|${timeframe}`;
        openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
        if (!groupMeta.has(key)) {
            groupMeta.set(key, { strategy: row.strategy, timeframe, open: 0 });
        }
    }

    const groups = new Map<string, typeof closedRows>();
    for (const row of closedRows) {
        const timeframe = normalizeTimeframe(row.timeframe, row.strategy);
        const key = `${row.strategy}|${timeframe}`;
        const group = groups.get(key);
        if (group) {
            group.push(row);
        } else {
            groups.set(key, [row]);
        }
    }

    const strategies: StrategyPerformance[] = [];
    const allNet: number[] = [];
    const allTrades: RecentTrade[] = [];
    let totalWins = 0;
    let totalLosses = 0;
    let best: TradeSummary | null = null;
    let worst: TradeSummary | null = null;

    const keys = new Set<string>([...groups.keys(), ...groupMeta.keys()]);

    for (const key of keys) {
        const rows = groups.get(key) ?? [];
        const meta = groupMeta.get(key);
        const first = rows[0];
        const strategy = meta?.strategy ?? first?.strategy ?? 'UNKNOWN';
        const timeframe =
            meta?.timeframe ??
            normalizeTimeframe(first?.timeframe, first?.strategy ?? 'UNKNOWN');

        const netValues: number[] = [];
        let wins = 0;
        let losses = 0;
        let groupBest: TradeSummary | null = null;
        let groupWorst: TradeSummary | null = null;

        for (const row of rows) {
            const net = row.netPerformancePercent;
            if (net == null || !Number.isFinite(net)) continue;

            netValues.push(net);
            allNet.push(net);
            if (net > 0) wins++;
            else losses++;

            const summary: TradeSummary = {
                symbol: row.symbol,
                netPercent: net,
                exitDate: tradeDate(row),
                exitReason: row.exitReason ?? null,
            };

            if (!groupBest || net > groupBest.netPercent) groupBest = summary;
            if (!groupWorst || net < groupWorst.netPercent) groupWorst = summary;
            if (!best || net > best.netPercent) best = summary;
            if (!worst || net < worst.netPercent) worst = summary;

            allTrades.push({
                ...summary,
                strategy,
                timeframe,
                holdingDays: row.holdingDays ?? null,
            });
        }

        totalWins += wins;
        totalLosses += losses;

        strategies.push({
            strategy,
            timeframe,
            trades: netValues.length,
            wins,
            losses,
            winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : null,
            avgNetPercent: mean(netValues),
            totalNetPercent: sum(netValues),
            best: groupBest,
            worst: groupWorst,
            open: openCounts.get(key) ?? 0,
        });
    }

    strategies.sort((a, b) => {
        if (b.trades !== a.trades) return b.trades - a.trades;
        return a.strategy.localeCompare(b.strategy);
    });

    // Most recent closed trades first, with a stable tie-breaker.
    allTrades.sort((a, b) => {
        const aTime = a.exitDate?.getTime() ?? 0;
        const bTime = b.exitDate?.getTime() ?? 0;
        if (bTime !== aTime) return bTime - aTime;
        return a.symbol.localeCompare(b.symbol);
    });

    return {
        periodDays,
        from,
        to,
        totalClosed: allNet.length,
        totalOpen: openRows.length,
        wins: totalWins,
        losses: totalLosses,
        winRate:
            totalWins + totalLosses > 0
                ? (totalWins / (totalWins + totalLosses)) * 100
                : null,
        avgNetPercent: mean(allNet),
        best,
        worst,
        strategies,
        recent: allTrades.slice(0, 12),
    };
}
