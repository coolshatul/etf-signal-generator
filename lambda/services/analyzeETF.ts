import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { backtestStrategy } from '../strategy/backtestEngine'; // import your new strategy
import { StrategyResult } from '../types';
import { STRATEGY_SETTINGS } from '../config/settings';
import chalk from 'chalk';

// Analyze an ETF and generate a swing trading signal based on backtested logic
export async function analyzeETF(symbol: string): Promise<StrategyResult> {
    console.log(`📊 Analyzing ${symbol} for swing trade using backtested strategy...`);

    const rawData = await fetchHistoricalData(symbol, STRATEGY_SETTINGS.backtestDays); // Slightly longer data for better signal
    if (!rawData.length) throw new Error(`No data found for ${symbol}`);

    const data = calculateIndicators(
        rawData,
        STRATEGY_SETTINGS.rsiPeriod,
        STRATEGY_SETTINGS.emaFastPeriod,
        STRATEGY_SETTINGS.emaSlowPeriod
    );
    const { trades, summary } = backtestStrategy(data);


    if (!trades.length) {
        return {
            symbol,
            date: data[data.length - 1].date,
            price: data[data.length - 1].close,
            rsi: data[data.length - 1].rsi,
            emaFast: data[data.length - 1].emaFast,
            emaSlow: data[data.length - 1].emaSlow,
            signal: 'HOLD',
            reason: 'No trades detected by strategy in recent data',
        };
    }

    const lastTrade = trades[trades.length - 1];
    const secondLastTrade = trades.length >= 2 ? trades[trades.length - 2] : undefined;
    const today = data[data.length - 1];

    // Determine current signal
    let signal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let reason = '';

    const isToday = lastTrade.date === today.date;

    if (isToday && lastTrade.type === 'BUY') {
        signal = 'BUY';
        reason = `Backtest triggered BUY today at ₹${lastTrade.price.toFixed(2)}`;
        console.log(chalk.green(`✅ New BUY signal for ${symbol} at ₹${lastTrade.price.toFixed(2)}`));
    } else if (isToday && lastTrade.type === 'SELL') {
        signal = 'SELL';
        reason = `Backtest triggered SELL today at ₹${lastTrade.price.toFixed(2)}, Profit: ${lastTrade.profit}`;
        console.log(chalk.red(`❌ New SELL signal for ${symbol} at ₹${lastTrade.price.toFixed(2)} (${lastTrade.profit})`));
    } else {
        signal = 'HOLD';
        reason = 'No new trade today based on strategy';
        console.log(chalk.yellow(`No new trade today for ${symbol}. Last trade was on ${lastTrade.date} (${lastTrade.type}) at ₹${lastTrade.price.toFixed(2)}`));
    }
    const showInsights = false
    const sellTrades = trades.filter(t => t.type === 'SELL');
    const profits = sellTrades.map(t => parseFloat(t.profit!.replace('%', '')));
    const wins = profits.filter(p => p > 0);
    const winRate = sellTrades.length ? ((wins.length / sellTrades.length) * 100).toFixed(2) : '0';

    if (showInsights) {
        // ➕ Add insights
        // const sellTrades = trades.filter(t => t.type === 'SELL');
        // const profits = sellTrades.map(t => parseFloat(t.profit!.replace('%', '')));
        const totalHoldingDays = sellTrades.reduce((acc, t) => acc + (t.holdingDays || 0), 0);

        // const wins = profits.filter(p => p > 0);
        const losses = profits.filter(p => p <= 0);

        const avgHolding = sellTrades.length ? (totalHoldingDays / sellTrades.length).toFixed(1) : '0';
        // const winRate = sellTrades.length ? ((wins.length / sellTrades.length) * 100).toFixed(2) : '0';

        const bestTrade = Math.max(...profits).toFixed(2);
        const worstTrade = Math.min(...profits).toFixed(2);

        console.log(chalk.cyan(`\n📊 Summary:`));
        console.log(`Total Trades    : ${chalk.bold(summary.totalTrades)}`);
        console.log(`Total Profit    : ${chalk.bold.green(summary.totalProfit)}`);
        console.log(`Winning Trades  : ${wins.length}`);
        console.log(`Losing Trades   : ${losses.length}`);
        console.log(`Win Rate        : ${winRate}%`);
        console.log(`Avg Holding Days: ${avgHolding}`);
        console.log(`Best Trade      : ${bestTrade}%`);
        console.log(`Worst Trade     : ${worstTrade}%`);
        console.log(`Annual Return    : ${chalk.bold(summary.annualReturn)}`);
        console.log(`Beats FD (7%)?   : ${summary.beatsFD ? chalk.green('✅ Yes') : chalk.red('❌ No')}`);
    }

    return {
        symbol,
        date: today.date,
        price: today.close,
        rsi: today.rsi,
        emaFast: today.emaFast,
        emaSlow: today.emaSlow,
        signal,
        reason,
        lastTrade: secondLastTrade
            ? {
                type: secondLastTrade.type,
                date: secondLastTrade.date,
                price: secondLastTrade.price,
                changeSince: `${(((today.close - secondLastTrade.price) / secondLastTrade.price) * 100).toFixed(2)}%`
            }
            : undefined,
        backtestStats: {
            totalTrades: summary.totalTrades,
            totalProfit: summary.totalProfit,
            annualReturn: summary.annualReturn,
            winRate,
        }
    };
}
