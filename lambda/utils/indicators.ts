import { RSI, EMA, MACD, ATR, ADX, BollingerBands, OBV } from 'technicalindicators';
import { Candle } from '../types';

export function calculateIndicators(
    data: Candle[],
    rsiPeriod: number = 14,
    emaFast: number = 9,
    emaSlow: number = 21
): Candle[] {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    const rsi = RSI.calculate({ period: rsiPeriod, values: closes });
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema10 = EMA.calculate({ period: 10, values: closes });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const ema36 = EMA.calculate({ period: 36, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });

    const obv = OBV.calculate({ close: closes, volume: volumes });
    const volEma20 = EMA.calculate({ period: 20, values: volumes });

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
    return data.map((d, i) => {
        const offsetRsi = data.length - rsi.length;
        const offsetEma9 = data.length - ema9.length;
        const offsetEma10 = data.length - ema10.length;
        const offsetEma20 = data.length - ema20.length;
        const offsetEma21 = data.length - ema21.length;
        const offsetEma36 = data.length - ema36.length;
        const offsetEma50 = data.length - ema50.length;
        const offsetObv = data.length - obv.length;
        const offsetVolEma = data.length - volEma20.length;
        const offsetMacd = data.length - macd.length;
        const offsetAtr = data.length - atr.length;
        const offsetAdx = data.length - adx.length;
        const offsetBbands = data.length - bbands.length;

        return {
            ...d,
            rsi: i >= offsetRsi ? rsi[i - offsetRsi] : null,
            ema9: i >= offsetEma9 ? ema9[i - offsetEma9] : null,
            ema10: i >= offsetEma10 ? ema10[i - offsetEma10] : null,
            ema20: i >= offsetEma20 ? ema20[i - offsetEma20] : null,
            ema21: i >= offsetEma21 ? ema21[i - offsetEma21] : null,
            ema36: i >= offsetEma36 ? ema36[i - offsetEma36] : null,
            ema50: i >= offsetEma50 ? ema50[i - offsetEma50] : null,
            obv: i >= offsetObv ? obv[i - offsetObv] : null,
            volEma20: i >= offsetVolEma ? volEma20[i - offsetVolEma] : null,
            macd: i >= offsetMacd ? macd[i - offsetMacd]?.MACD : null,
            macdSignal: i >= offsetMacd ? macd[i - offsetMacd]?.signal : null,
            macdHistogram: i >= offsetMacd ? macd[i - offsetMacd]?.histogram : null,
            atr: i >= offsetAtr ? atr[i - offsetAtr] : null,
            adx: i >= offsetAdx ? adx[i - offsetAdx]?.adx : null,
            bbUpper: i >= offsetBbands ? bbands[i - offsetBbands]?.upper : null,
            bbLower: i >= offsetBbands ? bbands[i - offsetBbands]?.lower : null,
            bbMiddle: i >= offsetBbands ? bbands[i - offsetBbands]?.middle : null,
            avgVolume20:
                i >= 19
                    ? volumes.slice(i - 19, i + 1).reduce((sum, v) => sum + v, 0) / 20
                    : null,
        };
    });
}
