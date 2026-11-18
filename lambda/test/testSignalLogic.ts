import assert from 'assert';
import {
    buildSignalKey,
    resolveEntryAt,
    signalSessionDate,
} from '../utils/signalIdentity';
import {
    validateTradeLevels,
    DEFAULT_MIN_RISK_REWARD,
} from '../utils/tradeLevels';
import {
    adjustLevelsForSplits,
    computePerformance,
    cumulativeSplitRatio,
    detectUnexplainedGap,
    DEFAULT_COST_MODEL,
} from '../utils/performanceMath';

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

try {
    testSignalIdentity();
    testTradeLevels();
    testPerformanceCosts();
    testSplits();
    testGapDetection();
    console.log('🎉 All signal logic tests passed.');
} catch (err) {
    console.error('❌ Signal logic test failed:', err);
    process.exitCode = 1;
}
