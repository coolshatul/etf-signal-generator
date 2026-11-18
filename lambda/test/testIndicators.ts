import assert from 'assert';
import { EMA } from 'technicalindicators';
import { calculateIndicators } from '../utils/indicators';
import { Candle } from '../types';
import {
    isCandleComplete,
    istDateKey,
    istWeekStartKey,
    startOfIstDay,
} from '../utils/marketTime';

function buildCandles(count: number): Candle[] {
    const start = new Date('2026-01-01T00:00:00.000Z').getTime();
    return Array.from({ length: count }, (_, i) => {
        const close = 100 + i;
        return {
            date: new Date(start + i * 86400000).toISOString(),
            open: close - 1,
            high: close + 1,
            low: close - 2,
            close,
            volume: 1000 + i * 10,
        };
    });
}

function assertFiniteOrNull(label: string, value: number | null) {
    if (value !== null) {
        assert.ok(Number.isFinite(value), `${label} should be finite, got ${value}`);
    }
}

function testIndicators() {
    const candles = buildCandles(80);
    const data = calculateIndicators(candles);

    assert.strictEqual(data.length, candles.length, 'indicator output length must match input');

    const first = data[0];
    assert.strictEqual(first.rsi, null, 'first candle RSI should be null');
    assert.strictEqual(first.ema9, null, 'first candle EMA9 should be null');
    assert.strictEqual(first.ema50, null, 'first candle EMA50 should be null');

    const last = data[data.length - 1] as any;
    for (const key of [
        'rsi', 'ema9', 'ema10', 'ema15', 'ema20', 'ema21', 'ema36', 'ema50',
        'emaFast', 'emaSlow', 'obv', 'macd', 'macdSignal', 'macdHistogram',
        'atr', 'adx', 'pdi', 'mdi', 'bbUpper', 'bbMiddle', 'bbLower',
        'avgVolume20', 'volumeRatio',
    ]) {
        assert.notStrictEqual(last[key], null, `${key} should be populated on the last candle`);
        assertFiniteOrNull(key, last[key]);
    }

    assert.ok(last.rsi > 90, `RSI on a strictly rising series should be high, got ${last.rsi}`);
    assert.strictEqual(last.emaFast, last.ema9, 'emaFast should alias EMA(9) by default');
    assert.strictEqual(last.emaSlow, last.ema21, 'emaSlow should alias EMA(21) by default');

    // Volume ratio: last volume / average of the last 20 volumes.
    const last20 = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    assert.ok(
        Math.abs(last.avgVolume20 - last20) < 1e-9,
        `avgVolume20 mismatch: ${last.avgVolume20} vs ${last20}`
    );

    // Custom fast/slow periods must be honoured.
    const custom = calculateIndicators(candles, 14, 5, 13);
    const customLast = custom[custom.length - 1] as any;
    const expectedFast = EMA.calculate({ period: 5, values: candles.map(c => c.close) }).pop();
    const expectedSlow = EMA.calculate({ period: 13, values: candles.map(c => c.close) }).pop();
    assert.ok(Math.abs(customLast.emaFast - expectedFast!) < 1e-6, 'custom emaFast not honoured');
    assert.ok(Math.abs(customLast.emaSlow - expectedSlow!) < 1e-6, 'custom emaSlow not honoured');

    console.log('✅ indicator alignment and custom EMA periods OK');
}

function testMarketTime() {
    // Monday 2026-11-16, 09:00 IST = 03:30 UTC
    const mondayOpen = new Date('2026-11-16T03:30:00.000Z');
    const mondayCandle = new Date('2026-11-16T00:00:00.000Z');
    const mondayMidday = new Date('2026-11-16T05:00:00.000Z'); // 10:30 IST
    const mondayAfterClose = new Date('2026-11-16T10:30:00.000Z'); // 16:00 IST

    assert.strictEqual(isCandleComplete(mondayCandle, '1d', mondayMidday), false);
    assert.strictEqual(isCandleComplete(mondayCandle, '1d', mondayAfterClose), true);

    // Tuesday: Monday's candle is complete.
    const tuesday = new Date('2026-11-17T03:30:00.000Z');
    assert.strictEqual(isCandleComplete(mondayCandle, '1d', tuesday), true);

    // Weekly candle dated Monday 2026-11-16.
    assert.strictEqual(isCandleComplete(mondayCandle, '1wk', mondayMidday), false);
    assert.strictEqual(isCandleComplete(mondayCandle, '1wk', mondayAfterClose), false);
    const fridayAfterClose = new Date('2026-11-20T10:30:00.000Z');
    assert.strictEqual(isCandleComplete(mondayCandle, '1wk', fridayAfterClose), true);

    // Intraday: a 15m bar is complete only after 15 minutes.
    const bar = new Date('2026-11-16T05:00:00.000Z');
    assert.strictEqual(isCandleComplete(bar, '15m', new Date('2026-11-16T05:10:00.000Z')), false);
    assert.strictEqual(isCandleComplete(bar, '15m', new Date('2026-11-16T05:20:00.000Z')), true);

    // IST date helpers.
    assert.strictEqual(istDateKey(mondayOpen), '2026-11-16');
    assert.strictEqual(istDateKey(new Date('2026-11-16T19:00:00.000Z')), '2026-11-17');
    assert.strictEqual(istWeekStartKey(mondayMidday), '2026-11-16');
    assert.strictEqual(istWeekStartKey(new Date('2026-11-22T12:00:00.000Z')), '2026-11-16');

    const start = startOfIstDay(mondayMidday);
    assert.strictEqual(start.toISOString(), '2026-11-15T18:30:00.000Z');

    console.log('✅ market-session completeness and IST helpers OK');
}

try {
    testIndicators();
    testMarketTime();
    console.log('🎉 All hardening tests passed.');
} catch (err) {
    console.error('❌ Hardening test failed:', err);
    process.exitCode = 1;
}
