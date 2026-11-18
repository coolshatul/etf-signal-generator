/**
 * Moves non-ETF signal history into `signals_archive`.
 *
 *   npm run archive-signals -- --dry-run
 *   npm run archive-signals
 *
 * The product is ETF-only now, so stock rows should stop appearing in every
 * query and report. They are copied first and only deleted after the copy is
 * confirmed, which makes this reversible until the archive is dropped.
 *
 * Archiving also freezes the 341 open stock positions: they leave the live
 * collection instead of being force-closed, so no fake exit price is invented.
 */

import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { Signal } from '../db/models';
import { etfSymbols } from '../utils/common';

const DRY_RUN = process.argv.includes('--dry-run');
const ARCHIVE = 'signals_archive';
const BATCH = 500;

const LEGACY_STRATEGIES = ['BULLISH_SCAN', 'BULLISH_SCAN_ALERT'];

const FILTER = {
    $or: [
        { symbol: { $nin: etfSymbols } },
        { strategy: { $in: LEGACY_STRATEGIES } },
    ],
};

async function main(): Promise<void> {
    console.log(
        `🗄️  Signal archive starting${DRY_RUN ? ' (dry run)' : ''}...\n`
    );

    await connectToDatabase();

    try {
        const db = Signal.db;
        const archive = db.collection(ARCHIVE);

        const breakdown = await Signal.aggregate([
            { $match: FILTER },
            {
                $group: {
                    _id: { strategy: '$strategy', status: '$status' },
                    n: { $sum: 1 },
                },
            },
            { $sort: { n: -1 } },
        ]);

        const total = breakdown.reduce(
            (sum: number, row: any) => sum + row.n,
            0
        );

        console.log(`Rows to archive: ${total}`);
        for (const row of breakdown) {
            console.log(
                `  ${String(row._id.strategy ?? '-').padEnd(26)} ${String(
                    row._id.status ?? 'null'
                ).padEnd(10)} ${row.n}`
            );
        }

        const keep = await Signal.countDocuments({ $nor: [FILTER] });
        console.log(`Rows staying in signals: ${keep}`);

        if (DRY_RUN) {
            console.log('\n[dry-run] nothing written.');
            return;
        }

        if (!total) {
            console.log('\nNothing to archive.');
            return;
        }

        let archived = 0;
        let deleted = 0;
        let processed = 0;

        while (processed < total) {
            const rows = await Signal.find(FILTER)
                .limit(BATCH)
                .lean();

            if (!rows.length) break;

            await archive.bulkWrite(
                rows.map(doc => ({
                    replaceOne: {
                        filter: { _id: doc._id },
                        replacement: doc,
                        upsert: true,
                    },
                })),
                { ordered: false }
            );

            const ids = rows.map(doc => doc._id);
            const result = await Signal.deleteMany({ _id: { $in: ids } });

            archived += rows.length;
            deleted += result.deletedCount ?? 0;
            processed += rows.length;

            console.log(`  moved ${archived}/${total} (deleted ${deleted})`);
        }

        const remaining = await Signal.countDocuments({});
        const archivedCount = await archive.countDocuments({});

        console.log('');
        console.log(`✅ Archived ${archived} rows, deleted ${deleted}.`);
        console.log(`signals: ${remaining}, ${ARCHIVE}: ${archivedCount}`);

        if (deleted !== archived) {
            console.error(
                '⚠️ Deleted count differs from archived count; check for concurrent writes.'
            );
        }

        const leftovers = await Signal.aggregate([
            { $match: FILTER },
            { $group: { _id: '$strategy', n: { $sum: 1 } } },
        ]);
        if (leftovers.length) {
            console.log('Remaining legacy rows (a scan may have written during the move):');
            for (const row of leftovers) {
                console.log(`  ${row._id}: ${row.n}`);
            }
        }
    } finally {
        await disconnectFromDatabase();
    }
}

main().catch(err => {
    console.error('❌ Archive failed:', err);
    process.exitCode = 1;
});
