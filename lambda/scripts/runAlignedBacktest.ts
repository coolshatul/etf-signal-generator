/**
 * Replays the live scanner rules over historical data.
 *
 *   npm run backtest-aligned
 *   npm run backtest-aligned -- --strategy=bullish --days=730 --limit=50
 *   npm run backtest-aligned -- --strategy=crossover --timeframe=15m --days=60
 *   npm run backtest-aligned -- --legacy
 *
 * The `--legacy` flag also runs the old engine on the same candles so the gap
 * between the old headline numbers and the live rules is visible.
 */

import {
    BacktestStrategy,
    backtestSeries,
    SymbolBacktest,
    summarise,
    truncateAtDataGlitches,
} from '../strategy/alignedBacktest';
import { backtestStrategy } from '../strategy/backtestEngine';
import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { CandleWithIndicators } from '../types';
import {
    etfSymbols,
    nifty50Symbols,
    niftyNext50Symbols,
    processWithConcurrency,
} from '../utils/common';

type Universe = 'nifty50' | 'both' | 'etfs' | 'custom';

interface Options {
    strategy: BacktestStrategy;
    timeframe: '1d' | '15m' | '1h';
    days: number;
    limit: number;
    universe: Universe;
    symbols?: string[];
    entryModel: 'signal_close' | 'next_open';
    legacy: boolean;
    concurrency: number;
}

function parseArgs(argv: string[]): Options {
    const get = (name: string): string | undefined => {
        const prefix = `--${name}=`;
        const match = argv.find(arg => arg.startsWith(prefix));
        return match ? match.slice(prefix.length) : undefined;
    };

    const strategyArg = (get('strategy') ?? 'bullish').toLowerCase();
    const strategy: BacktestStrategy =
        strategyArg === 'crossover' || strategyArg === 'ema_crossover'
            ? 'EMA_CROSSOVER_SCAN'
            : strategyArg === 'legacy-bullish'
              ? 'BULLISH_SCAN'
              : 'ETF_BULLISH_SCAN';

    const defaultTimeframe =
        strategy === 'EMA_CROSSOVER_SCAN' ? '15m' : '1d';
    const timeframe = (get('timeframe') ?? defaultTimeframe) as Options['timeframe'];

    const days = Number(get('days') ?? (timeframe === '1d' ? 730 : 60));
    const limit = Number(get('limit') ?? 50);
    const symbolsArg = get('symbols');
    const universeArg = (get('universe') ?? (symbolsArg ? 'custom' : 'nifty50')).toLowerCase();
    const universe: Universe =
        universeArg === 'etfs' || universeArg === 'etf'
            ? 'etfs'
            : universeArg === 'both'
              ? 'both'
              : universeArg === 'custom'
                ? 'custom'
                : 'nifty50';
    const entryModel =
        get('entry') === 'signal_close' ? 'signal_close' : 'next_open';
    const concurrency = Number(get('concurrency') ?? 5);

    return {
        strategy,
        timeframe,
        days: Number.isFinite(days) && days > 0 ? days : 730,
        limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
        universe,
        symbols: symbolsArg
            ? symbolsArg
                  .split(',')
                  .map(value => value.trim().toUpperCase())
                  .filter(Boolean)
            : undefined,
        entryModel,
        legacy: argv.includes('--legacy'),
        concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 5,
    };
}

function formatPercent(value: number | null, digits = 2): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatRatio(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return value.toFixed(2);
}

interface FetchResult {
    symbol: string;
    rows: CandleWithIndicators[];
    error?: string;
}

async function loadSymbol(
    symbol: string,
    options: Options
): Promise<FetchResult> {
    try {
        const candles = await fetchHistoricalData(
            symbol,
            options.days,
            options.timeframe
        );
        if (!candles.length) {
            return { symbol, rows: [], error: 'no data' };
        }

        const cleaned = truncateAtDataGlitches(candles);
        if (cleaned.droppedBars > 0) {
            console.log(
                `⚠️ ${symbol}: dropped ${cleaned.droppedBars} bars before ${cleaned.lastGlitch?.slice(
                    0,
                    10
                )} (price-scale jump)`
            );
        }

        return { symbol, rows: calculateIndicators(cleaned.rows) };
    } catch (err: any) {
        return { symbol, rows: [], error: err?.message ?? String(err) };
    }
}

function printSummary(
    summary: ReturnType<typeof summarise>,
    buyHold: number | null,
    entryModel: Options['entryModel']
): void {
    const line = (label: string, value: string) =>
        console.log(`  ${label.padEnd(22)} ${value}`);

    console.log('');
    console.log(
        `📊 ${summary.strategy} · ${summary.timeframe} · entry ${entryModel}`
    );
    console.log('─'.repeat(52));
    line('Symbols', String(summary.symbols));
    line(
        'Period',
        `${summary.from?.slice(0, 10) ?? '—'} → ${summary.to?.slice(0, 10) ?? '—'}`
    );
    line('Entries taken', String(summary.entries));
    line('Rejected at levels', String(summary.rejected));
    line('Closed trades', String(summary.trades));
    line('Still open (excluded)', String(summary.open));
    line(
        'Win rate',
        summary.winRate == null ? '—' : `${summary.winRate.toFixed(1)}%`
    );
    line('Avg net / trade', formatPercent(summary.avgNetPercent));
    line('Median net / trade', formatPercent(summary.medianNetPercent));
    line('Avg gross / trade', formatPercent(summary.avgGrossPercent));
    line('Avg win / avg loss', `${formatPercent(summary.avgWinPercent)} / ${formatPercent(summary.avgLossPercent)}`);
    line('Total net (sum)', formatPercent(summary.totalNetPercent));
    line('Profit factor', formatRatio(summary.profitFactor));
    line('Avg holding', summary.avgHoldingDays == null ? '—' : `${summary.avgHoldingDays.toFixed(1)}d`);
    line('Max losing streak', String(summary.maxConsecutiveLosses));
    line(
        'Exits',
        `stop ${summary.exits.STOP} · target ${summary.exits.TARGET} · max-hold ${summary.exits.MAX_HOLDING}`
    );
    line(
        'Equal-wt portfolio',
        formatPercent(summary.portfolioReturnPercent)
    );
    line(
        'Max drawdown',
        formatPercent(summary.maxDrawdownPercent)
    );
    line(
        'Best trade',
        summary.best
            ? `${summary.best.symbol} ${formatPercent(summary.best.netPercent)} (${summary.best.entryDate.slice(0, 10)})`
            : '—'
    );
    line(
        'Worst trade',
        summary.worst
            ? `${summary.worst.symbol} ${formatPercent(summary.worst.netPercent)} (${summary.worst.entryDate.slice(0, 10)})`
            : '—'
    );
    line('Buy & hold (equal wt)', formatPercent(buyHold));

    if (summary.yearly.length) {
        console.log('');
        console.log('  Year    Trades  Win%    AvgNet   TotalNet');
        for (const row of summary.yearly) {
            console.log(
                `  ${String(row.year).padEnd(7)} ${String(row.trades).padStart(
                    5
                )}  ${(row.winRate == null
                    ? '—'
                    : row.winRate.toFixed(1) + '%'
                ).padStart(6)}  ${formatPercent(row.avgNetPercent).padStart(
                    7
                )}  ${formatPercent(row.totalNetPercent).padStart(9)}`
            );
        }
    }

    if (summary.rejectionReasons.length) {
        console.log('');
        console.log('  Top level rejections');
        for (const item of summary.rejectionReasons.slice(0, 5)) {
            console.log(`   - ${item.count}x ${item.reason}`);
        }
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const universe =
        options.symbols ??
        (options.universe === 'etfs'
            ? etfSymbols
            : options.universe === 'both'
              ? [...nifty50Symbols, ...niftyNext50Symbols]
              : nifty50Symbols);
    const symbols = universe.slice(0, options.limit);

    console.log(
        `🔄 Aligned backtest: ${options.strategy} ${options.timeframe}, ${symbols.length} symbols, ${options.days} calendar days`
    );

    const loaded = await processWithConcurrency(
        symbols,
        symbol => loadSymbol(symbol, options),
        options.concurrency,
        100
    );

    const failed = loaded.filter(item => item.error);
    if (failed.length) {
        console.log(
            `⚠️ ${failed.length} symbols had no usable data: ${failed
                .slice(0, 5)
                .map(item => `${item.symbol} (${item.error})`)
                .join(', ')}`
        );
    }

    const usable = loaded.filter(item => !item.error && item.rows.length);

    const runs: SymbolBacktest[] = usable.map(item =>
        backtestSeries(
            item.symbol,
            item.rows,
            options.strategy,
            options.timeframe,
            { entryModel: options.entryModel }
        )
    );

    const summary = summarise(runs, options.strategy, options.timeframe);

    // Equal-weight buy & hold over the same window for context.
    const buyHoldReturns: number[] = [];
    for (const item of usable) {
        const warmup = 100;
        const start = item.rows[warmup];
        const end = item.rows[item.rows.length - 1];
        if (start && end) {
            buyHoldReturns.push(((end.close - start.close) / start.close) * 100);
        }
    }
    const buyHold = buyHoldReturns.length
        ? buyHoldReturns.reduce((total, value) => total + value, 0) /
          buyHoldReturns.length
        : null;

    printSummary(summary, buyHold, options.entryModel);

    // Per-symbol spread, useful for spotting a few names carrying the result.
    const perSymbol = runs
        .filter(run => run.trades.length)
        .map(run => {
            const closed = run.trades.filter(trade => trade.exitReason !== 'OPEN');
            const total = closed.reduce((sum, trade) => sum + trade.netPercent, 0);
            return {
                symbol: run.symbol,
                trades: closed.length,
                total,
                wins: closed.filter(trade => trade.netPercent > 0).length,
            };
        })
        .sort((a, b) => b.total - a.total);

    if (perSymbol.length) {
        const best = perSymbol.slice(0, 5);
        const worst = perSymbol.slice(-5).reverse();
        console.log('');
        console.log('  Best symbols');
        for (const row of best) {
            console.log(
                `   ${row.symbol.padEnd(12)} ${row.trades} trades  ${formatPercent(row.total)}`
            );
        }
        console.log('  Worst symbols');
        for (const row of worst) {
            console.log(
                `   ${row.symbol.padEnd(12)} ${row.trades} trades  ${formatPercent(row.total)}`
            );
        }
    }

    if (options.legacy) {
        console.log('');
        console.log('─'.repeat(52));
        console.log('🧪 Legacy engine on the same candles (not the live rules)');
        let legacyTrades = 0;
        let legacyProfit = 0;
        let legacyCagr: number[] = [];
        for (const item of usable) {
            const run = backtestStrategy(item.rows);
            legacyTrades += run.summary.totalTrades;
            legacyProfit += parseFloat(run.summary.totalProfit);
            legacyCagr.push(parseFloat(run.summary.annualReturn));
        }
        const avgCagr = legacyCagr.length
            ? legacyCagr.reduce((total, value) => total + value, 0) /
              legacyCagr.length
            : null;
        console.log(`  Trades (sum across symbols)  ${legacyTrades}`);
        console.log(`  Summed profit (gross)        ${formatPercent(legacyProfit)}`);
        console.log(`  Avg CAGR per symbol          ${formatPercent(avgCagr)}`);
        console.log('  Note: no costs, close-only exits, 8%/3% fixed exits.');
    }

    console.log('');
    console.log('✅ Backtest complete.');
}

main().catch(err => {
    console.error('❌ Backtest failed:', err);
    process.exitCode = 1;
});
