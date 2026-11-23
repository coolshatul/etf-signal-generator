import assert from 'assert';
import {
    buildSignalKey,
    resolveEntryAt,
    signalSessionDate,
} from '../utils/signalIdentity';
import {
    validateTradeLevels,
    maxValidEntry,
    DEFAULT_MIN_RISK_REWARD,
} from '../utils/tradeLevels';
import {
    adjustLevelsForSplits,
    computePerformance,
    cumulativeSplitRatio,
    detectUnexplainedGap,
    holdingWindowEnd,
    isWithinHoldingWindow,
    DEFAULT_COST_MODEL,
} from '../utils/performanceMath';
import {
    evaluateBullishEntry,
    calculateBullishLevels,
    evaluateCrossoverAt,
} from '../strategy/liveRules';
import { backtestSeries, summarise } from '../strategy/alignedBacktest';
import { selectWithinBookLimits } from '../utils/bookLimits';
import { CandleWithIndicators } from '../types';

function testSignalIdentity() {
    const eventAt = new Date('2026-11-17T04:15:00.000Z');

    const key = buildSignalKey({
        strategy: 'BULLISH_SCAN',
        timeframe: '1d',
        symbol: 'reliance',
        direction: 'BUY',
        eventAt,
    });

    assert.strictEqual(
        key,
        'BULLISH_SCAN|1d|RELIANCE|BUY|2026-11-17T04:15:00.000Z'
    );

    // Same input is stable.
    assert.strictEqual(
        key,
        buildSignalKey({
            strategy: 'BULLISH_SCAN',
            timeframe: '1d',
            symbol: 'RELIANCE',
            direction: 'BUY',
            eventAt,
        })
    );

    // Direction and timeframe are part of the identity.
    assert.notStrictEqual(
        key,
        buildSignalKey({
            strategy: 'BULLISH_SCAN',
            timeframe: '1d',
            symbol: 'RELIANCE',
            direction: 'SELL',
            eventAt,
        })
    );
    assert.notStrictEqual(
        key,
        buildSignalKey({
            strategy: 'EMACROSSOVER',
            timeframe: '15m',
            symbol: 'RELIANCE',
            direction: 'BUY',
            eventAt,
        })
    );

    // Missing event time must fail loudly rather than collide on an empty key.
    assert.throws(() =>
        buildSignalKey({
            strategy: 'BULLISH_SCAN',
            timeframe: '1d',
            symbol: 'RELIANCE',
            direction: 'BUY',
            eventAt: 'not-a-date',
        })
    );

    // Entry resolution prefers the candle timestamp, then the fallback.
    assert.strictEqual(
        resolveEntryAt('2026-11-17T04:15:00.000Z').toISOString(),
        '2026-11-17T04:15:00.000Z'
    );
    assert.strictEqual(
        resolveEntryAt(undefined, '2026-11-10T00:00:00.000Z').toISOString(),
        '2026-11-10T00:00:00.000Z'
    );

    // Session date is IST midnight, not UTC midnight.
    assert.strictEqual(
        signalSessionDate(new Date('2026-11-17T20:00:00.000Z')).toISOString(),
        '2026-11-17T18:30:00.000Z'
    );

    console.log('✅ signal identity OK');
}

function testTradeLevels() {
    const goodBuy = validateTradeLevels({
        direction: 'BUY',
        entry: 100,
        stopLoss: 95,
        target: 110,
    });
    assert.strictEqual(goodBuy.valid, true);
    assert.strictEqual(goodBuy.riskRewardRatio, 2);
    assert.strictEqual(goodBuy.stopPercent, 5);

    // Stop above entry with zero/negative risk must be rejected.
    const inverted = validateTradeLevels({
        direction: 'BUY',
        entry: 100,
        stopLoss: 101,
        target: 110,
    });
    assert.strictEqual(inverted.valid, false);
    assert.match(inverted.reason ?? '', /below entry/);

    // Target on the wrong side.
    assert.strictEqual(
        validateTradeLevels({
            direction: 'BUY',
            entry: 100,
            stopLoss: 95,
            target: 99,
        }).valid,
        false
    );

    // R:R below the default minimum.
    const thin = validateTradeLevels({
        direction: 'BUY',
        entry: 100,
        stopLoss: 95,
        target: 106,
    });
    assert.strictEqual(thin.valid, false);
    assert.match(thin.reason ?? '', new RegExp(String(DEFAULT_MIN_RISK_REWARD)));

    // Stop too close / too wide.
    assert.strictEqual(
        validateTradeLevels({
            direction: 'BUY',
            entry: 100,
            stopLoss: 99.9,
            target: 120,
        }).valid,
        false
    );
    assert.strictEqual(
        validateTradeLevels({
            direction: 'BUY',
            entry: 100,
            stopLoss: 80,
            target: 200,
        }).valid,
        false
    );

    // SELL mirrors the BUY rules.
    const goodSell = validateTradeLevels({
        direction: 'SELL',
        entry: 100,
        stopLoss: 105,
        target: 90,
    });
    assert.strictEqual(goodSell.valid, true);
    assert.strictEqual(goodSell.riskRewardRatio, 2);

    assert.strictEqual(
        validateTradeLevels({
            direction: 'SELL',
            entry: 100,
            stopLoss: 99,
            target: 90,
        }).valid,
        false
    );

    // Non-finite levels are rejected.
    assert.strictEqual(
        validateTradeLevels({
            direction: 'BUY',
            entry: NaN,
            stopLoss: 95,
            target: 110,
        }).valid,
        false
    );

    console.log('✅ trade level validation OK');
}

function testPerformanceCosts() {
    const long = computePerformance('BUY', 100, 110, DEFAULT_COST_MODEL);
    assert.strictEqual(long.grossPercent, 10);
    assert.strictEqual(
        long.costPercent,
        DEFAULT_COST_MODEL.roundTripCostPercent +
            (DEFAULT_COST_MODEL.slippageBpsPerSide / 100) * 2
    );
    assert.ok(Math.abs(long.netPercent - (10 - 0.45)) < 1e-9);

    const short = computePerformance('SELL', 100, 90, DEFAULT_COST_MODEL);
    assert.strictEqual(short.grossPercent, 10);
    assert.ok(Math.abs(short.netPercent - (10 - 0.45)) < 1e-9);

    // A losing trade loses more after costs.
    const loss = computePerformance('BUY', 100, 95, DEFAULT_COST_MODEL);
    assert.strictEqual(loss.grossPercent, -5);
    assert.ok(loss.netPercent < -5);

    // Defensive handling of bad input.
    assert.deepStrictEqual(computePerformance('BUY', 0, 100), {
        grossPercent: 0,
        netPercent: 0,
        costPercent: 0,
    });

    console.log('✅ performance costs OK');
}

function testSplits() {
    const entryAt = new Date('2026-01-05T00:00:00.000Z');
    const splits = [
        // Before entry - must be ignored.
        { date: '2025-12-01T00:00:00.000Z', numerator: 2, denominator: 1, ratio: 2 },
        // After entry - applied.
        { date: '2026-02-01T00:00:00.000Z', numerator: 2, denominator: 1, ratio: 2 },
        { date: '2026-03-01T00:00:00.000Z', numerator: 3, denominator: 2, ratio: 1.5 },
    ];

    assert.strictEqual(cumulativeSplitRatio(splits, entryAt), 3);

    // 1:2 reverse split after entry.
    assert.strictEqual(
        cumulativeSplitRatio(
            [
                {
                    date: '2026-02-01T00:00:00.000Z',
                    numerator: 1,
                    denominator: 2,
                    ratio: 0.5,
                },
            ],
            entryAt
        ),
        0.5
    );

    const adjusted = adjustLevelsForSplits(300, 270, 360, 3);
    assert.ok(adjusted);
    assert.strictEqual(adjusted!.entry, 100);
    assert.strictEqual(adjusted!.stopLoss, 90);
    assert.strictEqual(adjusted!.target, 120);

    // Optional levels stay undefined.
    const partial = adjustLevelsForSplits(300, undefined, undefined, 3);
    assert.strictEqual(partial!.stopLoss, undefined);
    assert.strictEqual(partial!.target, undefined);

    // Invalid ratios are rejected.
    assert.strictEqual(adjustLevelsForSplits(300, 270, 360, 0), null);

    console.log('✅ split adjustment OK');
}

function testHoldingWindow() {
    const entryAt = new Date('2026-01-01T00:00:00.000Z');

    assert.strictEqual(
        holdingWindowEnd(entryAt, 30).toISOString(),
        '2026-01-31T00:00:00.000Z'
    );

    // Entry bar itself can never trigger an exit.
    assert.strictEqual(
        isWithinHoldingWindow('2026-01-01T00:00:00.000Z', entryAt, 30),
        false
    );

    // Inside the window.
    assert.strictEqual(
        isWithinHoldingWindow('2026-01-02T00:00:00.000Z', entryAt, 30),
        true
    );
    assert.strictEqual(
        isWithinHoldingWindow('2026-01-31T00:00:00.000Z', entryAt, 30),
        true
    );

    // One day after expiry must be ignored.
    assert.strictEqual(
        isWithinHoldingWindow('2026-02-01T00:00:00.000Z', entryAt, 30),
        false
    );

    // Bad timestamps are ignored.
    assert.strictEqual(isWithinHoldingWindow('not-a-date', entryAt, 30), false);

    console.log('✅ holding window OK');
}

function testGapDetection() {
    const normal = detectUnexplainedGap([
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 104 },
        { date: '2026-01-03', close: 102 },
    ]);
    assert.strictEqual(normal.found, false);

    const gap = detectUnexplainedGap([
        { date: '2026-01-01', close: 100 },
        { date: '2026-01-02', close: 50 },
    ]);
    assert.strictEqual(gap.found, true);
    assert.strictEqual(gap.from, '2026-01-01');
    assert.strictEqual(gap.to, '2026-01-02');
    assert.strictEqual(gap.changePercent, -50);

    // Exactly at the threshold trips.
    assert.strictEqual(
        detectUnexplainedGap([
            { date: '2026-01-01', close: 100 },
            { date: '2026-01-02', close: 135 },
        ]).found,
        true
    );

    // A smaller gap does not.
    assert.strictEqual(
        detectUnexplainedGap([
            { date: '2026-01-01', close: 100 },
            { date: '2026-01-02', close: 130 },
        ]).found,
        false
    );

    console.log('✅ unexplained gap detection OK');
}

function testLiveRules() {
    const bullish = evaluateBullishEntry({
        ema10: 101,
        ema20: 100,
        ema50: 95,
        prevEMA20: 99,
        prevEMA50: 94,
        rsi: 50,
        macdHistogram: 0.5,
        lastClose: 102,
        prevClose: 101,
        prevPrevClose: 100,
        volume: 2000,
        avgVolume20: 1500,
        obv: 200,
        prevObv: 190,
    });

    assert.strictEqual(bullish.isBullish, true);
    assert.ok(bullish.rating >= 5);

    // Below both fast EMAs is an early bail, not a low score.
    const below = evaluateBullishEntry({
        ema10: 110,
        ema20: 108,
        ema50: 100,
        prevEMA20: 107,
        prevEMA50: 99,
        rsi: 50,
        macdHistogram: 0.5,
        lastClose: 105,
        prevClose: 104,
        prevPrevClose: 103,
        volume: 2000,
        avgVolume20: 1500,
        obv: 200,
        prevObv: 190,
    });
    assert.strictEqual(below.isBullish, false);
    assert.strictEqual(below.blockedBy, 'below EMA10 and EMA20');

    // Falling price is rejected before scoring.
    const falling = evaluateBullishEntry({
        ema10: 101,
        ema20: 100,
        ema50: 95,
        prevEMA20: 99,
        prevEMA50: 94,
        rsi: 50,
        macdHistogram: 0.5,
        lastClose: 99,
        prevClose: 100,
        prevPrevClose: 98,
        volume: 2000,
        avgVolume20: 1500,
        obv: 200,
        prevObv: 190,
    });
    assert.strictEqual(falling.isBullish, false);
    assert.strictEqual(falling.blockedBy, 'not up vs previous close');

    // Entry ceiling: stop within 12% and a reward floor.
    assert.strictEqual(maxValidEntry(90, 105), 97.5);
    assert.ok(maxValidEntry(90, 200) > 97.5);
    // At a 1.2 floor the ceiling is (target + 1.2*stop) / 2.2.
    assert.strictEqual(maxValidEntry(90, 105, 12, 1.2), (105 + 108) / 2.2);

    const levels = calculateBullishLevels(100, 95, 110, 97, 1);
    assert.strictEqual(levels.baseStopLevel, 97);
    assert.strictEqual(levels.stopLoss, 95.5);
    // Live default is a 1.5R target with no swing-high floor.
    assert.strictEqual(levels.target, 106.75);
    assert.ok(Math.abs(levels.riskRewardRatio - 1.5) < 1e-12);

    // A target that is exactly 1.5R must pass the 1.5 guard even when float
    // division lands a hair below the boundary. Scan a range of prices so the
    // test actually hits representation error rather than one hand-picked case.
    let boundaryCases = 0;
    for (let i = 1; i < 400; i++) {
        const entry = 100 + i * 0.37;
        const stopPercent = 0.6 + (i % 200) * 0.05;
        const stop = entry * (1 - stopPercent / 100);
        const risk = entry - stop;
        const target = entry + risk * 1.5;
        const ratio = (target - entry) / risk;

        if (ratio < 1.5) boundaryCases++;

        const validation = validateTradeLevels(
            { direction: 'BUY', entry, stopLoss: stop, target },
            { minRiskReward: 1.5, minStopPercent: 0.5, maxStopPercent: 50 }
        );
        assert.strictEqual(
            validation.valid,
            true,
            `exact 1.5R rejected at entry ${entry}: ${validation.reason}`
        );
    }
    assert.ok(boundaryCases > 0, 'expected at least one float boundary case');

    // The swing-high floor is still available for sweep comparisons.
    const floored = calculateBullishLevels(100, 95, 110, 97, 1, {
        swingHighBuffer: 1.05,
    });
    assert.strictEqual(floored.target, 115.5);

    console.log('✅ live entry rules OK');
}

function crossoverRow(
    date: string,
    close: number,
    ema9: number,
    ema15: number,
    ema50: number,
    rsi: number
): CandleWithIndicators {
    return {
        date,
        open: close,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 1000,
        ema9,
        ema15,
        ema50,
        rsi,
    } as unknown as CandleWithIndicators;
}

function testCrossoverRules() {
    const rows: CandleWithIndicators[] = [];
    for (let i = 0; i < 10; i++) {
        const close = 100;
        const ema9 = i === 9 ? 100 : 94;
        const ema15 = 96;
        const ema50 = 92 + i * 0.2;
        const rsi = i === 9 ? 55 : 48;
        rows.push(
            crossoverRow(
                `2026-01-${String(i + 1).padStart(2, '0')}`,
                close,
                ema9,
                ema15,
                ema50,
                rsi
            )
        );
    }

    const evaluation = evaluateCrossoverAt(rows, 9, {
        minRiskReward: 1.5,
        minStopPercent: 0.5,
        maxStopPercent: 12,
    });

    assert.strictEqual(evaluation.direction, 'BUY');
    assert.strictEqual(evaluation.stopLoss, 93.8);
    assert.ok((evaluation.target ?? 0) > 100);

    // No cross in the last five bars means no signal.
    const stale = rows.map(row => ({ ...row, ema9: 100 }));
    const none = evaluateCrossoverAt(stale, 9, {
        minRiskReward: 1.5,
        minStopPercent: 0.5,
        maxStopPercent: 12,
    });
    assert.strictEqual(none.direction, null);
    assert.strictEqual(none.reason, 'no recent cross');

    console.log('✅ crossover rules OK');
}

function risingSeries(count: number, fallingAfter?: number): CandleWithIndicators[] {
    const rows: CandleWithIndicators[] = [];
    for (let i = 0; i < count; i++) {
        const close =
            fallingAfter != null && i > fallingAfter
                ? 100 + fallingAfter * 0.5 - (i - fallingAfter) * 3
                : 100 + i * 0.5;
        rows.push({
            date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString(),
            open: close,
            high: close + 0.4,
            low: close - 0.4,
            close,
            volume: 2000,
            rsi: 50,
            macdHistogram: 0.5,
            ema9: close - 0.1,
            ema10: close - 0.2,
            ema15: close - 0.35,
            ema20: close - 0.5,
            ema50: close - 2,
            atr: 1,
            obv: i,
            avgVolume20: 1500,
        } as unknown as CandleWithIndicators);
    }
    return rows;
}

function testAlignedBacktest() {
    // Rising series: the long target is reached and the result is net of costs.
    const winners = backtestSeries(
        'TESTWIN',
        risingSeries(140),
        'BULLISH_SCAN',
        '1d',
        { entryModel: 'signal_close' }
    );
    assert.ok(winners.trades.length > 0, 'expected at least one trade');
    assert.strictEqual(winners.trades[0].exitReason, 'TARGET');
    assert.ok(winners.trades[0].netPercent > 2.5);
    assert.ok(winners.trades[0].netPercent < 3.5);

    const summary = summarise([winners], 'BULLISH_SCAN', '1d');
    assert.ok(summary.trades >= 1);
    assert.ok(summary.winRate != null && summary.winRate > 50);

    // Falling series: the stop is hit and the loss includes costs.
    const losers = backtestSeries(
        'TESTLOSS',
        risingSeries(140, 100),
        'BULLISH_SCAN',
        '1d',
        { entryModel: 'signal_close' }
    );
    assert.strictEqual(losers.trades[0].exitReason, 'STOP');
    assert.ok(losers.trades[0].netPercent < 0);
    // The series gaps through the stop, so the fill is the open, not 146.5.
    assert.ok(losers.trades[0].exitPrice! < 146.5);
    assert.ok(losers.trades[0].netPercent > -5);

    // Executable entries: fill at the next open and keep the absolute levels.
    const executable = backtestSeries(
        'TESTNEXT',
        risingSeries(140),
        'ETF_BULLISH_SCAN',
        '1d',
        { entryModel: 'next_open', entryMinRiskReward: 1.0 }
    );
    assert.ok(executable.trades.length > 0, 'expected next-open trades');
    assert.strictEqual(executable.trades[0].entryModel, 'next_open');
    assert.ok(executable.trades[0].entry > 150, 'entry should be the next open');
    assert.ok(executable.trades[0].entryRiskReward < 1.5);

    // An open above the entry ceiling invalidates the trade.
    const ceilingRows = risingSeries(140);
    ceilingRows[101] = {
        ...ceilingRows[101],
        open: 152,
        high: 152.5,
        low: 151.5,
        close: 152,
    } as any;
    const ceilingBlocked = backtestSeries(
        'TESTCEIL',
        ceilingRows,
        'ETF_BULLISH_SCAN',
        '1d',
        { entryModel: 'next_open' }
    );
    const blockedDate = ceilingRows[101].date;
    assert.ok(
        !ceilingBlocked.trades.some(trade => trade.entryDate === blockedDate),
        'the gapped entry must not be taken'
    );

    // A bar that opens beyond the stop must fill at the open, not the stop.
    const gapRows = risingSeries(140);
    const gapIdx = 102; // entry happened at bar 101's open
    gapRows[gapIdx] = {
        ...gapRows[gapIdx],
        open: 140,
        high: 140.5,
        low: 139.5,
        close: 140,
    } as any;
    const gapped = backtestSeries(
        'TESTGAP',
        gapRows,
        'ETF_BULLISH_SCAN',
        '1d',
        { entryModel: 'next_open', entryMinRiskReward: 1.0 }
    );
    assert.strictEqual(gapped.trades[0].exitReason, 'STOP');
    assert.strictEqual(gapped.trades[0].exitPrice, 140);
    assert.ok(gapped.trades[0].exitPrice < 146.5, 'fill must be below the stop');

    console.log('✅ aligned backtest OK');
}

function testBookLimits() {
    const limits = { maxOpenPositions: 8, maxPerGroup: 2 };

    // Two slots free, but only one per group.
    const onePerGroup = selectWithinBookLimits(
        [
            { symbol: 'NIFTYBEES', rating: 9 },
            { symbol: 'BANKBEES', rating: 8 },
            { symbol: 'NIFTYETF', rating: 7 },
        ],
        { count: 6, byGroup: {} },
        { maxOpenPositions: 8, maxPerGroup: 1 }
    );
    assert.deepStrictEqual(
        onePerGroup.accepted.map(item => item.symbol),
        ['NIFTYBEES', 'BANKBEES']
    );
    // The third candidate loses on slots before the group check runs.
    assert.strictEqual(onePerGroup.skippedSlots, 1);
    assert.strictEqual(onePerGroup.skippedGroup, 0);

    // Book already full: nothing is added, and the best rating is not a bypass.
    const full = selectWithinBookLimits(
        [
            { symbol: 'ITBEES', rating: 9 },
            { symbol: 'GOLDBEES', rating: 8 },
        ],
        { count: 8, byGroup: {} },
        limits
    );
    assert.strictEqual(full.accepted.length, 0);
    assert.strictEqual(full.skippedSlots, 2);

    // One slot free: the higher-rated setup wins it.
    const oneSlot = selectWithinBookLimits(
        [
            { symbol: 'CPSEETF', rating: 6 },
            { symbol: 'AUTOBEES', rating: 9 },
        ],
        { count: 7, byGroup: {} },
        limits
    );
    assert.deepStrictEqual(
        oneSlot.accepted.map(item => item.symbol),
        ['AUTOBEES']
    );
    assert.strictEqual(oneSlot.skippedSlots, 1);

    // A group at its cap is skipped even when slots are free.
    const groupFull = selectWithinBookLimits(
        [{ symbol: 'NIFTYETF', rating: 9 }],
        { count: 2, byGroup: { broad: 2 } },
        limits
    );
    assert.strictEqual(groupFull.accepted.length, 0);
    assert.strictEqual(groupFull.skippedGroup, 1);

    console.log('✅ book limits OK');
}

try {
    testSignalIdentity();
    testTradeLevels();
    testPerformanceCosts();
    testSplits();
    testHoldingWindow();
    testGapDetection();
    testLiveRules();
    testCrossoverRules();
    testAlignedBacktest();
    testBookLimits();
    console.log('🎉 All signal logic tests passed.');
} catch (err) {
    console.error('❌ Signal logic test failed:', err);
    process.exitCode = 1;
}
