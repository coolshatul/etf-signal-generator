/**
 * Small, idempotent data repairs for signal rows created before the identity
 * migration.
 *
 *   npm run repair-signal-data -- --dry-run
 *   npm run repair-signal-data
 *
 * Fixes:
 * 1. Rows with no status are closed as MIGRATION so they cannot sit outside
 *    every report/performance query forever.
 * 2. Legacy HIT_SL / HIT_TARGET rows get an explicit exitReason so reporting
 *    can group them consistently.
 *
 * Strategy names are intentionally left untouched: signalKey embeds the
 * strategy, so renaming would break identity.
 */

import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { Signal } from '../db/models';
import { SIGNAL_STRATEGIES } from '../utils/signalIdentity';
import { DEFAULT_MAX_HOLDING_DAYS, MAX_HOLDING_DAYS } from '../config/settings';

const DRY_RUN = process.argv.includes('--dry-run');

function daysBetween(from: Date, to: Date): number {
    return Math.max(
        0,
        Math.round((to.getTime() - from.getTime()) / 86400000)
    );
}

async function repairMissingStatus(): Promise<number> {
    const rows = await Signal.collection
        .find({
            $or: [
                { status: { $exists: false } },
                { status: null },
                { status: '' },
            ],
        })
        .toArray();

    if (!rows.length) return 0;

    console.log(
        `${DRY_RUN ? '[dry-run] would repair' : 'Repairing'} ${rows.length} rows with no status.`
    );

    for (const row of rows) {
        const strategy: string = row.strategy ?? SIGNAL_STRATEGIES.bullish;
        const entryAt = row.entryAt ? new Date(row.entryAt) : new Date(row.date);
        const ageDays = daysBetween(entryAt, new Date());
        const maxHolding =
            MAX_HOLDING_DAYS[strategy] ?? DEFAULT_MAX_HOLDING_DAYS;

        // A row old enough to be outside its holding window is historical;
        // close it. A fresh row is made OPEN so the tracker picks it up.
        const status = ageDays > maxHolding ? 'CLOSED' : 'OPEN';

        if (DRY_RUN) continue;

        await Signal.collection.updateOne(
            { _id: row._id },
            {
                $set: {
                    status,
                    ...(status === 'CLOSED'
                        ? { exitReason: 'MIGRATION', holdingDays: ageDays }
                        : {}),
                    lastUpdatedAt: new Date(),
                    'metadata.repairedStatus': {
                        previous: row.status ?? null,
                        repairedAt: new Date().toISOString(),
                        reason: 'missing status',
                    },
                },
            }
        );
    }

    return rows.length;
}

async function backfillExitReasons(): Promise<{
    stop: number;
    target: number;
}> {    const stopFilter = {
        status: 'HIT_SL',
        $or: [{ exitReason: { $exists: false } }, { exitReason: null }],
    };
    const targetFilter = {
        status: 'HIT_TARGET',
        $or: [{ exitReason: { $exists: false } }, { exitReason: null }],
    };

    const stop = await Signal.collection.countDocuments(stopFilter);
    const target = await Signal.collection.countDocuments(targetFilter);

    if (!DRY_RUN && (stop || target)) {
        if (stop) {
            await Signal.collection.updateMany(stopFilter, {
                $set: { exitReason: 'STOP' },
            });
        }
        if (target) {
            await Signal.collection.updateMany(targetFilter, {
                $set: { exitReason: 'TARGET' },
            });
        }
    }

    return { stop, target };
}

/**
 * Signals closed long after their holding window are backlog reconciliations,
 * not trades that closed this week. Mark them so the weekly digest can exclude
 * them while all-time statistics still include them.
 */
async function markBacklogCloses(): Promise<number> {
    const strategies = new Set<string>([
        ...Object.keys(MAX_HOLDING_DAYS),
        SIGNAL_STRATEGIES.bullish,
        'BULLISH_SCAN_ALERT',
    ]);

    let total = 0;

    for (const strategy of strategies) {
        const maxHolding =
            MAX_HOLDING_DAYS[strategy] ?? DEFAULT_MAX_HOLDING_DAYS;
        const filter = {
            strategy,
            exitReason: 'MAX_HOLDING',
            holdingDays: { $gt: maxHolding + 2 },
            'metadata.backlogClose': { $ne: true },
        };

        const count = await Signal.collection.countDocuments(filter);
        if (!count) continue;

        console.log(
            `${DRY_RUN ? '[dry-run] would mark' : 'Marking'} ${count} backlog closes for ${strategy}.`
        );

        if (!DRY_RUN) {
            await Signal.collection.updateMany(filter, {
                $set: { 'metadata.backlogClose': true },
            });
        }

        total += count;
    }

    return total;
}

async function reportLegacyStrategies(): Promise<void> {
    const rows = await Signal.aggregate([
        {
            $group: {
                _id: '$strategy',
                total: { $sum: 1 },
                open: {
                    $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] },
                },
            },
        },
        { $sort: { total: -1 } },
    ]);

    console.log('Strategy inventory:');
    for (const row of rows) {
        console.log(
            `  - ${row._id}: total=${row.total}, open=${row.open}${
                row._id === 'BULLISH_SCAN_ALERT' ? ' (legacy)' : ''
            }`
        );
    }
}

async function main(): Promise<void> {
    console.log(
        `🔧 Signal data repair starting${DRY_RUN ? ' (dry run)' : ''}...`
    );

    await connectToDatabase();

    try {
        const statusRepairs = await repairMissingStatus();
        const exitReasons = await backfillExitReasons();
        const backlogCloses = await markBacklogCloses();

        console.log(
            `${DRY_RUN ? '[dry-run] would backfill' : 'Backfilled'} exitReason: STOP=${
                exitReasons.stop
            }, TARGET=${exitReasons.target}`
        );

        console.log(
            `${DRY_RUN ? '[dry-run] would mark' : 'Marked'} ${backlogCloses} backlog closes.`
        );

        await reportLegacyStrategies();

        console.log(
            `✅ Repair complete${DRY_RUN ? ' (nothing written)' : ''}. statusRepairs=${statusRepairs}`
        );
    } finally {
        await disconnectFromDatabase();
    }
}

main().catch(err => {
    console.error('❌ Repair failed:', err);
    process.exitCode = 1;
});
