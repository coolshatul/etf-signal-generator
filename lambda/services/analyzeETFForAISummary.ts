import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { backtestStrategy } from '../strategy/backtestEngine';
import { STRATEGY_SETTINGS } from '../config/settings';


export async function analyzeETFForAISummary(symbol: string) {
    console.log(`📊 Analyzing ${symbol} for AI summary...`);

    const rawData = await fetchHistoricalData(symbol, STRATEGY_SETTINGS.backtestDays);
    if (!rawData.length) throw new Error(`No data found for ${symbol}`);

    const data = calculateIndicators(
        rawData,
        STRATEGY_SETTINGS.rsiPeriod,
        STRATEGY_SETTINGS.emaFastPeriod,
        STRATEGY_SETTINGS.emaSlowPeriod
    );

    const { trades, summary } = backtestStrategy(data);
    const today = data[data.length - 1];

    const sellTrades = trades.filter(t => t.type === 'SELL');
    const profits = sellTrades.map(t => parseFloat(t.profit!.replace('%', '')));
    const wins = profits.filter(p => p > 0);
    const losses = profits.filter(p => p <= 0);
    const totalHoldingDays = sellTrades.reduce((acc, t) => acc + (t.holdingDays || 0), 0);

    const backtestStats = {
        backtestDays: STRATEGY_SETTINGS.backtestDays,
        totalTrades: summary.totalTrades,
        totalProfit: summary.totalProfit,
        annualReturn: summary.annualReturn,
        winRate: sellTrades.length ? ((wins.length / sellTrades.length) * 100).toFixed(2) : '0',
        avgHoldingDays: sellTrades.length ? (totalHoldingDays / sellTrades.length).toFixed(1) : '0',
        bestTrade: profits.length ? Math.max(...profits).toFixed(2) : 'N/A',
        worstTrade: profits.length ? Math.min(...profits).toFixed(2) : 'N/A',
        beatsFD: summary.beatsFD
    };

    return {
        symbol,
        date: today.date,
        price: today.close,
        rsi: today.rsi,
        emaFast: today.emaFast,
        emaSlow: today.emaSlow,
        macd: today.macd,
        macdSignal: today.macdSignal,
        atr: today.atr,
        adx: today.adx,
        bbUpper: today.bbUpper,
        bbMiddle: today.bbMiddle,
        bbLower: today.bbLower,
        avgVolume20: today.avgVolume20,
        backtestStats,
    };
}
