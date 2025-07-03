import { fetchHistoricalData } from '../utils/fetchData';
import { calculateIndicators } from '../utils/indicators';
import { STRATEGY_SETTINGS } from '../config/settings';

export async function fetchTechnicalData(symbol: string) {
    console.log(`📊 Analyzing ${symbol} for AI summary...`);

    const rawData = await fetchHistoricalData(symbol, 90); // Fetch 90 days of data for better context
    if (!rawData.length) throw new Error(`No data found for ${symbol}`);

    const data = calculateIndicators(
        rawData,
        STRATEGY_SETTINGS.rsiPeriod,
        STRATEGY_SETTINGS.emaFastPeriod,
        STRATEGY_SETTINGS.emaSlowPeriod
    );

    const today = data[data.length - 1];

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
        avgVolume20: today.avgVolume20
    };
}
