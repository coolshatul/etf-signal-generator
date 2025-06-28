import { RSI, EMA, MACD, ATR, ADX, BollingerBands, } from 'technicalindicators';
import { Candle } from '../types';

export function calculateIndicators(
    data: Candle[],
    rsiPeriod: number,
    emaFast: number,
    emaSlow: number
): Candle[] {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    const rsi = RSI.calculate({ period: rsiPeriod, values: closes });
    const ema9 = EMA.calculate({ period: emaFast, values: closes });
    const ema21 = EMA.calculate({ period: emaSlow, values: closes });

    const macd = MACD.calculate({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        values: closes,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
    });

    const atr = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });
    const adx = ADX.calculate({ period: 14, close: closes, high: highs, low: lows });

    const bbands = BollingerBands.calculate({
        period: 20,
        stdDev: 2,
        values: closes,
    });

    // Attach all indicators to data
    return data.map((d, i) => ({
        ...d,
        rsi: rsi[i - (data.length - rsi.length)] ?? null,
        emaFast: ema9[i - (data.length - ema9.length)] ?? null,
        emaSlow: ema21[i - (data.length - ema21.length)] ?? null,
        macd: macd[i - (data.length - macd.length)]?.MACD ?? null,
        macdSignal: macd[i - (data.length - macd.length)]?.signal ?? null,
        atr: atr[i - (data.length - atr.length)] ?? null,
        adx: adx[i - (data.length - adx.length)]?.adx ?? null,
        bbUpper: bbands[i - (data.length - bbands.length)]?.upper ?? null,
        bbLower: bbands[i - (data.length - bbands.length)]?.lower ?? null,
        bbMiddle: bbands[i - (data.length - bbands.length)]?.middle ?? null,
        avgVolume20:
            i >= 19
                ? volumes.slice(i - 19, i + 1).reduce((sum, v) => sum + v, 0) / 20
                : null,
    }));
}
