/**
 * Parameter sweep for the bullish scanner, measured with the aligned harness.
 *
 *   npm run sweep-bullish
 *   npm run sweep-bullish -- --days=730 --limit=50
 *
 * Candles are fetched once per symbol and reused for every configuration, so
 * the comparison is on identical data. Nothing here changes production
 * settings; it only prints what each variant would have done.
 */

import {
    BacktestOverrides,
    backtestSeries,
    SymbolBacktest,
    summarise,
} from '../strategy/alignedBacktest';
import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { CandleWithIndicators } from '../types';
import { etfSymbols, nifty50Symbols, processWithConcurrency } from '../utils/common';

interface Options {
    days: number;
    limit: number;
    universe: 'nifty50' | 'etfs';
    drop: string[];
    windows: boolean;
}

function parseArgs(argv: string[]): Options {
    const get = (name: string): string | undefined => {
        const prefix = `--${name}=`;
        const match = argv.find(arg => arg.startsWith(prefix));
        return match ? match.slice(prefix.length) : undefined;
    };
    const days = Number(get('days') ?? 730);
    const limit = Number(get('limit') ?? 50);
    const universe = (get('universe') ?? 'nifty50') === 'etfs' ? 'etfs' : 'nifty50';
    const drop = (get('drop') ?? '')
        .split(',')
        .map(value => value.trim().toUpperCase())
        .filter(Boolean);

    return {
        days: Number.isFinite(days) && days > 0 ? days : 730,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
        universe,
        drop,
        windows: argv.includes('--windows'),
    };
}

function pct(value: number | null, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function num(value: number | null, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return value.toFixed(digits);
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const universe = options.universe === 'etfs' ? etfSymbols : nifty50Symbols;
    const symbols = universe
        .filter(symbol => !options.drop.includes(symbol))
        .slice(0, options.limit);

    console.log(
        `🔄 Loading ${symbols.length} ${options.universe} symbols (${options.days} days of daily candles)...`
    );

    const loaded = await processWithConcurrency(
        symbols,
        async (symbol): Promise<{ symbol: string; rows: CandleWithIndicators[] }> => {
            try {
                const candles = await fetchHistoricalData(
                    symbol,
                    options.days,
                    '1d'
                );
                return { symbol, rows: calculateIndicators(candles) };
            } catch {
                return { symbol, rows: [] };
            }
        },
        5,
        100
    );

    const usable = loaded.filter(item => item.rows.length > 120);
    console.log(`✅ ${usable.length} symbols with usable data\n`);

    const targetMultiple = [1, 1.5, 2];
    const floors = [
        { label: 'swing+5%', value: 1.05 },
        { label: 'none', value: 0 },
    ];
    const holdings = [15, 30, 45];
    const stopCaps = [12, 15];

    const results: Array<{
        overrides: BacktestOverrides;
        label: string;
        trades: number;
        winRate: number | null;
        avgNet: number | null;
        profitFactor: number | null;
        portfolio: number | null;
        drawdown: number | null;
        exits: string;
    }> = [];

    for (const rMultiple of targetMultiple) {
        for (const floor of floors) {
            for (const holding of holdings) {
                for (const cap of stopCaps) {
                    const overrides: BacktestOverrides = {
                        targetRMultiple: rMultiple,
                        swingHighBuffer: floor.value,
                        maxHoldingDays: holding,
                        maxStopPercent: cap,
                    };

                    const runs: SymbolBacktest[] = usable.map(item =>
                        backtestSeries(
                            item.symbol,
                            item.rows,
                            'BULLISH_SCAN',
                            '1d',
                            overrides
                        )
                    );
                    const summary = summarise(
                        runs,
                        'BULLISH_SCAN',
                        '1d'
                    );

                    results.push({
                        overrides,
                        label: `${rMultiple}R ${floor.label} ${holding}d cap${cap}%`,
                        trades: summary.trades,
                        winRate: summary.winRate,
                        avgNet: summary.avgNetPercent,
                        profitFactor: summary.profitFactor,
                        portfolio: summary.portfolioReturnPercent,
                        drawdown: summary.maxDrawdownPercent,
                        exits: `${summary.exits.STOP}/${summary.exits.TARGET}/${summary.exits.MAX_HOLDING}`,
                    });
                }
            }
        }
    }

    results.sort((a, b) => (b.avgNet ?? -Infinity) - (a.avgNet ?? -Infinity));

    console.log(
        'Target      Trades  Win%    AvgNet   PF    Portfolio  MaxDD    Stop/Tgt/Hold'
    );
    console.log('─'.repeat(82));
    for (const row of results) {
        console.log(
            `${row.label.padEnd(26)} ${String(row.trades).padStart(5)}  ${num(
                row.winRate,
                1
            ).padStart(5)}  ${pct(row.avgNet).padStart(7)}  ${num(
                row.profitFactor
            ).padStart(5)}  ${pct(row.portfolio).padStart(9)}  ${pct(
                row.drawdown
            ).padStart(7)}   ${row.exits}`
        );
    }

    // ---- Entry-quality experiments -------------------------------------
    // Exits are exhausted: the best grid row is still negative. Hold the best
    // exit configuration fixed and vary the entry gates instead.
    const bestExit: BacktestOverrides = {
        targetRMultiple: 1.5,
        swingHighBuffer: 1.05,
        maxHoldingDays: 30,
        maxStopPercent: 12,
    };

    const entryVariants: Array<{ label: string; overrides: BacktestOverrides }> = [
        { label: 'baseline (score>=5)', overrides: {} },
        { label: 'score>=6', overrides: { bullishThreshold: 6 } },
        { label: 'score>=7', overrides: { bullishThreshold: 7 } },
        { label: 'score>=8', overrides: { bullishThreshold: 8 } },
        { label: 'RSI 45-65', overrides: { bullishRsiMin: 45, bullishRsiMax: 65 } },
        { label: 'RSI 40-70', overrides: { bullishRsiMin: 40, bullishRsiMax: 70 } },
        { label: 'RSI 45-55', overrides: { bullishRsiMin: 45, bullishRsiMax: 55 } },
        { label: 'ADX>=15', overrides: { minAdx: 15 } },
        { label: 'ADX>=20', overrides: { minAdx: 20 } },
        { label: 'ADX>=25', overrides: { minAdx: 25 } },
        {
            label: 'score>=6 + ADX>=20',
            overrides: { bullishThreshold: 6, minAdx: 20 },
        },
        {
            label: 'score>=6 + RSI 45-65',
            overrides: { bullishThreshold: 6, bullishRsiMin: 45, bullishRsiMax: 65 },
        },
    ];

    console.log('\nEntry gate experiments (1.5R swing+5% 30d cap12%):\n');
    console.log('Variant                    Trades  Win%    AvgNet   PF    Portfolio  MaxDD');
    console.log('─'.repeat(82));

    const entryResults: Array<{ label: string; avgNet: number | null }> = [];

    for (const variant of entryVariants) {
        const overrides: BacktestOverrides = { ...bestExit, ...variant.overrides };
        const runs: SymbolBacktest[] = usable.map(item =>
            backtestSeries(item.symbol, item.rows, 'BULLISH_SCAN', '1d', overrides)
        );
        const summary = summarise(runs, 'BULLISH_SCAN', '1d');

        entryResults.push({ label: variant.label, avgNet: summary.avgNetPercent });

        console.log(
            `${variant.label.padEnd(26)} ${String(summary.trades).padStart(5)}  ${num(
                summary.winRate,
                1
            ).padStart(5)}  ${pct(summary.avgNetPercent).padStart(7)}  ${num(
                summary.profitFactor
            ).padStart(5)}  ${pct(summary.portfolioReturnPercent).padStart(
                9
            )}  ${pct(summary.maxDrawdownPercent).padStart(7)}`
        );
    }

    // ---- Robustness: time split -----------------------------------------
    if (options.windows) {
        const best: BacktestOverrides = {
            targetRMultiple: 1.5,
            swingHighBuffer: 0,
            maxHoldingDays: 45,
            maxStopPercent: 12,
        };

        const firsts = usable
            .map(item => item.rows[0]?.date)
            .filter(Boolean)
            .sort();
        const lasts = usable
            .map(item => item.rows[item.rows.length - 1]?.date)
            .filter(Boolean)
            .sort();

        const start = firsts[firsts.length - 1] ?? '1970-01-01';
        const end = lasts[0] ?? '2100-01-01';
        const mid = new Date(
            (new Date(start).getTime() + new Date(end).getTime()) / 2
        ).toISOString();

        const windows = [
            { label: 'full period', from: undefined, to: undefined },
            { label: 'first half', from: start, to: mid },
            { label: 'second half', from: mid, to: end },
        ];

        console.log('\nRobustness (1.5R none 45d cap12%):\n');
        console.log('Window           Trades  Win%    AvgNet   PF    Portfolio  MaxDD');
        console.log('─'.repeat(74));

        for (const window of windows) {
            const runs: SymbolBacktest[] = usable.map(item =>
                backtestSeries(item.symbol, item.rows, 'BULLISH_SCAN', '1d', {
                    ...best,
                    entryFrom: window.from,
                    entryTo: window.to,
                })
            );
            const summary = summarise(runs, 'BULLISH_SCAN', '1d');
            console.log(
                `${window.label.padEnd(16)} ${String(summary.trades).padStart(5)}  ${num(
                    summary.winRate,
                    1
                ).padStart(5)}  ${pct(summary.avgNetPercent).padStart(7)}  ${num(
                    summary.profitFactor
                ).padStart(5)}  ${pct(summary.portfolioReturnPercent).padStart(
                    9
                )}  ${pct(summary.maxDrawdownPercent).padStart(7)}`
            );
        }

        console.log(`\n  window: ${start.slice(0, 10)} to ${end.slice(0, 10)}, split at ${mid.slice(0, 10)}`);
    }

    // Buy & hold over the same window, for context.
    const buyHold: number[] = [];
    for (const item of usable) {
        const start = item.rows[100];
        const end = item.rows[item.rows.length - 1];
        if (start && end) {
            buyHold.push(((end.close - start.close) / start.close) * 100);
        }
    }
    const meanBuyHold = buyHold.length
        ? buyHold.reduce((total, value) => total + value, 0) / buyHold.length
        : null;

    console.log('');
    console.log(`Equal-weight buy & hold: ${pct(meanBuyHold)}`);
    console.log('');
    console.log('Sorted by average net return per trade.');
    console.log('Columns Stop/Tgt/Hold are exit counts.');
}

main().catch(err => {
    console.error('❌ Sweep failed:', err);
    process.exitCode = 1;
});
