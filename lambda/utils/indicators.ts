import { RSI, EMA, MACD, ATR, ADX, BollingerBands, OBV } from 'technicalindicators';
import { Candle } from '../types';

/**
 * Attaches all indicators used by the scanners to each candle.
 *
 * Series returned by `technicalindicators` are right-aligned (they end at the
 * same candle as the input). The offset logic below maps them back onto the
 * original index. `emaFast`/`emaSlow` are also exposed so the backtest engine
 * and configurable strategies do not depend on hardcoded EMA periods.
 */
export function calculateIndicators(
    data: Candle[],
    rsiPeriod: number = 14,
    emaFast: number = 9,
    emaSlow: number = 21
): Candle[] {
    if (!Array.isArray(data) || data.length === 0) return [];

    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    const rsi = RSI.calculate({ period: rsiPeriod, values: closes });
    const ema9 = EMA.calculate({ period: 9, values: closes });
    const ema10 = EMA.calculate({ period: 10, values: closes });
    const ema15 = EMA.calculate({ period: 15, values: closes });
    const ema20 = EMA.calculate({ period: 20, values: closes });
    const ema21 = EMA.calculate({ period: 21, values: closes });
    const ema36 = EMA.calculate({ period: 36, values: closes });
    const ema50 = EMA.calculate({ period: 50, values: closes });
    const fastSeries = emaFast === 9 ? ema9 : EMA.calculate({ period: emaFast, values: closes });
    const slowSeries = emaSlow === 21 ? ema21 : EMA.calculate({ period: emaSlow, values: closes });

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

    const offsets = {
        rsi: data.length - rsi.length,
        ema9: data.length - ema9.length,
        ema10: data.length - ema10.length,
        ema15: data.length - ema15.length,
        ema20: data.length - ema20.length,
        ema21: data.length - ema21.length,
        ema36: data.length - ema36.length,
        ema50: data.length - ema50.length,
        emaFast: data.length - fastSeries.length,
        emaSlow: data.length - slowSeries.length,
        obv: data.length - obv.length,
        volEma20: data.length - volEma20.length,
        macd: data.length - macd.length,
        atr: data.length - atr.length,
        adx: data.length - adx.length,
        bbands: data.length - bbands.length,
    };

    // Rolling 20-period volume average. Computed once instead of slicing inside
    // the map, which was O(n^2).
    const avgVolume20: Array<number | null> = [];
    let volumeSum = 0;
    for (let i = 0; i < volumes.length; i++) {
        volumeSum += volumes[i];
        if (i >= 20) volumeSum -= volumes[i - 20];
        avgVolume20.push(i >= 19 ? volumeSum / 20 : null);
    }

    const pick = <T>(series: T[], offset: number, index: number): T | null => {
        if (index < offset) return null;
        const value = series[index - offset];
        return value === undefined ? null : value;
    };

    return data.map((d, i) => {
        const macdValue = pick(macd, offsets.macd, i);
        const adxValue = pick(adx, offsets.adx, i);
        const bbValue = pick(bbands, offsets.bbands, i);
        const avg = avgVolume20[i];

        return {
            ...d,
            rsi: pick(rsi, offsets.rsi, i),
            ema9: pick(ema9, offsets.ema9, i),
            ema10: pick(ema10, offsets.ema10, i),
            ema15: pick(ema15, offsets.ema15, i),
            ema20: pick(ema20, offsets.ema20, i),
            ema21: pick(ema21, offsets.ema21, i),
            ema36: pick(ema36, offsets.ema36, i),
            ema50: pick(ema50, offsets.ema50, i),
            emaFast: pick(fastSeries, offsets.emaFast, i),
            emaSlow: pick(slowSeries, offsets.emaSlow, i),
            obv: pick(obv, offsets.obv, i),
            volEma20: pick(volEma20, offsets.volEma20, i),
            macd: macdValue?.MACD ?? null,
            macdSignal: macdValue?.signal ?? null,
            macdHistogram: macdValue?.histogram ?? null,
            atr: pick(atr, offsets.atr, i),
            adx: adxValue?.adx ?? null,
            pdi: adxValue?.pdi ?? null,
            mdi: adxValue?.mdi ?? null,
            bbUpper: bbValue?.upper ?? null,
            bbLower: bbValue?.lower ?? null,
            bbMiddle: bbValue?.middle ?? null,
            avgVolume20: avg,
            volumeRatio: avg && avg > 0 ? d.volume / avg : null,
        };
    });
}
