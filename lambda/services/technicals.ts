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

    console.log(today);
    

    return {
        symbol,
        date: today.date,
        open: today.open,
        high: today.high,
        low: today.low,
        price: today.close,
        volume: today.volume,
        rsi: today.rsi,
        ema9: today.ema9,
        ema15: today.ema15,
        ema21: today.ema21,
        ema50: today.ema50,
        macd: today.macd,
        macdSignal: today.macdSignal,
        macdHistogram: today.macdHistogram,
        atr: today.atr,
        adx: today.adx,
        pdi: today.pdi,
        mdi: today.mdi,
        bbUpper: today.bbUpper,
        bbMiddle: today.bbMiddle,
        bbLower: today.bbLower,
        avgVolume20: today.avgVolume20,
        volumeRatio: today.volumeRatio
    };
}
