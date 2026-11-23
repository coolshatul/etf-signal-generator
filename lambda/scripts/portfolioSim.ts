/**
 * Compare portfolio constructions on identical data.
 *
 *   npm run portfolio-sim
 */

import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { CandleWithIndicators } from '../types';
import { liquidEtfSymbols, processWithConcurrency } from '../utils/common';
import { truncateAtDataGlitches } from '../strategy/alignedBacktest';
import {
    PortfolioConfig,
    runPortfolio,
} from '../strategy/portfolioBacktest';

function pct(value: number | null, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function num(value: number | null, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return value.toFixed(digits);
}

async function main(): Promise<void> {
    console.log('🔄 Loading liquid ETFs...');

    const loaded = await processWithConcurrency(
        liquidEtfSymbols,
        async (symbol): Promise<{ symbol: string; rows: CandleWithIndicators[] }> => {
            try {
                const raw = await fetchHistoricalData(symbol, 2400, '1d');
                return {
                    symbol,
                    rows: calculateIndicators(truncateAtDataGlitches(raw).rows),
                };
            } catch {
                return { symbol, rows: [] };
            }
        },
        5,
        100
    );

    const series = new Map<string, CandleWithIndicators[]>();
    for (const item of loaded) {
        if (item.rows.length > 120) series.set(item.symbol, item.rows);
    }
    console.log(`✅ ${series.size} symbols\n`);

    const base: PortfolioConfig = {
        initialCapital: 1_000_000,
        riskPerTrade: 0.005,
        maxConcurrent: 100,
        maxCombinedRisk: 1,
        maxDeployed: 1,
        entryMinRiskReward: 1.0,
    };

    const configs: Array<{ label: string; config: PortfolioConfig }> = [
        { label: 'no caps · 0.5% · floor 1.0', config: { ...base } },
        {
            label: 'no caps · 0.5% · floor 1.2',
            config: { ...base, entryMinRiskReward: 1.2 },
        },
        {
            label: '8 slots · 0.25% · 2% · floor 1.2',
            config: {
                ...base,
                riskPerTrade: 0.0025,
                entryMinRiskReward: 1.2,
                maxConcurrent: 8,
                maxCombinedRisk: 0.02,
            },
        },
        {
            label: '8 slots · 0.25% · 2% · group 2',
            config: {
                ...base,
                riskPerTrade: 0.0025,
                entryMinRiskReward: 1.2,
                maxConcurrent: 8,
                maxCombinedRisk: 0.02,
                maxPerGroup: 2,
            },
        },
        {
            label: '6 slots · 0.33% · 2% · group 2',
            config: {
                ...base,
                riskPerTrade: 0.0033,
                entryMinRiskReward: 1.2,
                maxConcurrent: 6,
                maxCombinedRisk: 0.02,
                maxPerGroup: 2,
            },
        },
        {
            label: '10 slots · 0.2% · 2% · group 3',
            config: {
                ...base,
                riskPerTrade: 0.002,
                entryMinRiskReward: 1.2,
                maxConcurrent: 10,
                maxCombinedRisk: 0.02,
                maxPerGroup: 3,
            },
        },
        {
            label: '4 slots · 0.5% · 2% · group 2',
            config: {
                ...base,
                entryMinRiskReward: 1.2,
                maxConcurrent: 4,
                maxCombinedRisk: 0.02,
                maxPerGroup: 2,
            },
        },
    ];

    console.log(
        'Config                          Trades  Win%   AvgTrade  PF    CAGR     MaxDD    AvgPos  MaxPos  AvgInv  Rejected'
    );
    console.log('─'.repeat(120));

    for (const { label, config } of configs) {
        const result = runPortfolio(series, config);
        const rejected = Object.values(result.rejections).reduce(
            (total, value) => total + value,
            0
        );
        console.log(
            `${label.padEnd(31)} ${String(result.trades.length).padStart(6)}  ${num(
                result.winRate,
                1
            ).padStart(5)}  ${pct(result.avgTradePercent).padStart(8)}  ${num(
                result.profitFactor
            ).padStart(5)}  ${pct(result.cagrPercent).padStart(7)}  ${pct(
                result.maxDrawdownPercent
            ).padStart(7)}  ${num(result.avgConcurrent, 1).padStart(6)}  ${String(
                result.maxConcurrent
            ).padStart(6)}  ${pct(result.avgDeployedPercent, 0).padStart(6)}  ${String(
                rejected
            ).padStart(8)}`
        );
    }

    console.log('');
    console.log('Sizing: 0.5% of equity risked per trade, 0.45% round-trip cost.');
    console.log('AvgPos/MaxPos: simultaneous positions. AvgInv: average invested capital.');
}

main().catch(err => {
    console.error('❌ Simulation failed:', err);
    process.exitCode = 1;
});
