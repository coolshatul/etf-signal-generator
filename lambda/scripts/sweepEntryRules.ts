/**
 * Sweep the two entry-quality rules on identical data:
 *   - post-exit cooldown for the same symbol
 *   - minimum reward:risk at the executable fill
 *
 *   npm run sweep-entry-rules
 */

import {
    BacktestOverrides,
    backtestSeries,
    SymbolBacktest,
    summarise,
    truncateAtDataGlitches,
} from '../strategy/alignedBacktest';
import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { CandleWithIndicators } from '../types';
import { liquidEtfSymbols, processWithConcurrency } from '../utils/common';

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

    const usable = loaded.filter(item => item.rows.length > 120);
    console.log(`✅ ${usable.length} symbols\n`);

    const cooldowns = [0, 3, 5, 10];
    const floors = [1.0, 1.2, 1.3];

    console.log('Cooldown  Floor  Trades  Win%    AvgNet   PF    Portfolio  MaxDD    Skipped  Invalid');
    console.log('─'.repeat(92));

    for (const cooldown of cooldowns) {
        for (const floor of floors) {
            const overrides: BacktestOverrides = {
                entryModel: 'next_open',
                entryMinRiskReward: floor,
                reentryCooldownDays: cooldown,
            };

            const runs: SymbolBacktest[] = usable.map(item =>
                backtestSeries(
                    item.symbol,
                    item.rows,
                    'ETF_BULLISH_SCAN',
                    '1d',
                    overrides
                )
            );
            const summary = summarise(runs, 'ETF_BULLISH_SCAN', '1d');
            const invalid = summary.rejectionReasons
                .filter(reason => reason.reason.startsWith('entry invalid after gap'))
                .reduce((total, reason) => total + reason.count, 0);

            console.log(
                `${String(cooldown).padStart(6)}d  ${floor.toFixed(
                    1
                )}   ${String(summary.trades).padStart(5)}  ${num(
                    summary.winRate,
                    1
                ).padStart(5)}  ${pct(summary.avgNetPercent).padStart(7)}  ${num(
                    summary.profitFactor
                ).padStart(5)}  ${pct(summary.portfolioReturnPercent).padStart(
                    9
                )}  ${pct(summary.maxDrawdownPercent).padStart(7)}  ${String(
                    summary.skippedCooldown
                ).padStart(7)}  ${String(invalid).padStart(7)}`
            );
        }
    }

    console.log('');
    console.log('Next-open entries, 6.5 years, 17 liquid ETFs.');
}

main().catch(err => {
    console.error('❌ Sweep failed:', err);
    process.exitCode = 1;
});
