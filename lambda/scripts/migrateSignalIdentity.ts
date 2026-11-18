/**
 * One-off migration for the signal identity / watchlist changes.
 *
 * Run this ONCE before deploying the new signal writers:
 *
 *   npm run migrate-signal-identity -- --dry-run
 *   npm run migrate-signal-identity
 *
 * What it does
 * 1. Drops the old `{ symbol, date, strategy }` unique index. It made a same-day
 *    BUY and SELL collide and was the source of the "duplicate / overwrite"
 *    behaviour this migration removes.
 * 2. Backfills `signalKey`, `entryAt` and `timeframe` on every legacy row.
 * 3. Converts legacy `EMA36_SCAN` rows (which were stored as OPEN BUY trades but
 *    never had a stop or target) into closed historical rows and renames the
 *    strategy to `WEEKLY_PULLBACK_WATCHLIST` (HOLD / WATCHLIST).
 * 4. Recreates the schema indexes, including the new unique `signalKey` index.
 *
 * The script is idempotent: rows that already have a `signalKey` are skipped,
 * and index creation is only attempted when needed.
 */

import { connectToDatabase, disconnectFromDatabase } from '../db/connection';
import { Signal } from '../db/models';
import { fetchHistoricalData } from '../utils/fetchData';
import {
    buildSignalKey,
    resolveEntryAt,
    SIGNAL_STRATEGIES,
} from '../utils/signalIdentity';
import { SignalDirection, SignalTimeframe } from '../types';

const DRY_RUN = process.argv.includes('--dry-run');

function legacyTimeframe(strategy: string, metadata?: any): SignalTimeframe {
    if (strategy === SIGNAL_STRATEGIES.emaCrossover) {
        return metadata?.performanceTimeframe === '1h' ? '1h' : '15m';
    }
    if (
        strategy === SIGNAL_STRATEGIES.weeklyPullback ||
        strategy === SIGNAL_STRATEGIES.legacyEMA36
    ) {
        return '1wk';
    }
    return '1d';
}

function sameKey(indexKey: any): boolean {
    const keys = Object.keys(indexKey ?? {});
    if (keys.length !== 3) return false;
    return (
        indexKey.symbol === 1 &&
        indexKey.date === 1 &&
        indexKey.strategy === 1
    );
}

async function dropOldUniqueIndex(): Promise<string | null> {
    const indexes = await Signal.collection.indexes();
    const legacy = indexes.find(index => sameKey(index.key));

    if (!legacy?.name) {
        return null;
    }

    console.log(
        `${DRY_RUN ? '[dry-run] would drop' : 'Dropping'} legacy index: ${legacy.name} ${JSON.stringify(
            legacy.key
        )}`
    );

    if (!DRY_RUN) {
        await Signal.collection.dropIndex(legacy.name);
    }

    return legacy.name;
}

interface BackfillResult {
    scanned: number;
    updated: number;
    skipped: number;
    collisions: string[];
}

async function backfillSignalIdentity(): Promise<BackfillResult> {
    const cursor = Signal.collection.find({});
    const all = await cursor.toArray();

    const result: BackfillResult = {
        scanned: all.length,
        updated: 0,
        skipped: 0,
        collisions: [],
    };

    const seen = new Set<string>();

    for (const row of all) {
        if (row.signalKey) {
            seen.add(row.signalKey);
            result.skipped++;
            continue;
        }

        const strategy: string = row.strategy ?? SIGNAL_STRATEGIES.bullish;
        const timeframe = legacyTimeframe(strategy, row.metadata);
        const direction = (row.signal ?? 'BUY') as SignalDirection;
        const entryAt = resolveEntryAt(row.metadata?.asOf, row.date);

        let signalKey: string;
        try {
            signalKey = buildSignalKey({
                strategy,
                timeframe,
                symbol: row.symbol,
                direction,
                eventAt: entryAt,
            });
        } catch (err) {
            result.collisions.push(
                `${row.symbol} (${String(row._id)}): ${(err as Error).message}`
            );
            continue;
        }

        if (seen.has(signalKey)) {
            // Should not happen with the old unique index, but report rather
            // than silently losing a row.
            result.collisions.push(`${row.symbol}: duplicate key ${signalKey}`);
            continue;
        }
        seen.add(signalKey);

        if (!DRY_RUN) {
            await Signal.collection.updateOne(
                { _id: row._id },
                {
                    $set: {
                        signalKey,
                        entryAt,
                        timeframe,
                    },
                }
            );
        }

        result.updated++;
    }

    return result;
}

interface WatchlistMigrationResult {
    converted: number;
}

/**
 * Old EMA36 rows were logged as OPEN BUY positions even though they never had
 * a stop or target. Convert them to closed historical rows at the latest close,
 * then rename the strategy so they can never be mistaken for executable trades.
 */
async function migrateLegacyWatchlist(): Promise<WatchlistMigrationResult> {
    const legacy = await Signal.collection
        .find({ strategy: SIGNAL_STRATEGIES.legacyEMA36 })
        .toArray();

    const result: WatchlistMigrationResult = { converted: legacy.length };

    if (!legacy.length) {
        return result;
    }

    console.log(
        `${DRY_RUN ? '[dry-run] would migrate' : 'Migrating'} ${legacy.length} legacy EMA36 rows to the weekly pullback watchlist.`
    );

    // One price lookup per symbol instead of one per row.
    const lastCloseBySymbol = new Map<string, number>();

    for (const row of legacy) {
        const symbol: string = row.symbol;

        if (!lastCloseBySymbol.has(symbol)) {
            let close: number | null = null;
            try {
                const candles = await fetchHistoricalData(symbol, 30, '1d');
                const last = candles[candles.length - 1];
                if (last && Number.isFinite(last.close)) {
                    close = last.close;
                }
            } catch (err) {
                console.warn(`⚠️ Could not fetch latest close for ${symbol}:`, err);
            }

            lastCloseBySymbol.set(
                symbol,
                close ?? row.lastPrice ?? row.price
            );
        }

        const exitPrice = lastCloseBySymbol.get(symbol)!;
        const exitDate = new Date();
        const entryAt = row.entryAt
            ? new Date(row.entryAt)
            : resolveEntryAt(row.metadata?.asOf, row.date);
        const holdingDays = Math.max(
            0,
            Math.round((exitDate.getTime() - entryAt.getTime()) / 86400000)
        );

        if (DRY_RUN) continue;

        await Signal.collection.updateOne(
            { _id: row._id },
            {
                $set: {
                    strategy: SIGNAL_STRATEGIES.weeklyPullback,
                    signal: 'HOLD',
                    subtype: 'WATCHLIST',
                    status: 'CLOSED',
                    exitReason: 'MIGRATION',
                    exitPrice,
                    exitDate,
                    holdingDays,
                    lastUpdatedAt: new Date(),
                    'metadata.migratedFrom': SIGNAL_STRATEGIES.legacyEMA36,
                    'metadata.executable': false,
                },
            }
        );
    }

    return result;
}

async function syncIndexes(): Promise<void> {
    if (DRY_RUN) {
        console.log('[dry-run] would run Signal.syncIndexes()');
        return;
    }

    await Signal.syncIndexes();
    console.log('✅ Signal indexes synced.');
}

async function main(): Promise<void> {
    console.log(
        `🔄 Signal identity migration starting${DRY_RUN ? ' (dry run)' : ''}...`
    );

    await connectToDatabase();

    try {
        await dropOldUniqueIndex();

        const backfill = await backfillSignalIdentity();
        console.log(
            `🔑 signalKey backfill: scanned=${backfill.scanned} updated=${backfill.updated} skipped=${backfill.skipped}`
        );
        if (backfill.collisions.length) {
            console.warn(
                `⚠️ ${backfill.collisions.length} rows could not be backfilled:`
            );
            for (const collision of backfill.collisions.slice(0, 20)) {
                console.warn(`   - ${collision}`);
            }
        }

        const watchlist = await migrateLegacyWatchlist();
        console.log(
            `👀 Legacy EMA36 rows converted to watchlist: ${watchlist.converted}`
        );

        if (backfill.collisions.length) {
            // Creating the unique index would either fail or index nulls.
            // Leave the old index dropped and reporting to the operator.
            console.error(
                '⛔ Skipping index sync because some rows have no signalKey. Fix the rows above and re-run.'
            );
        } else {
            await syncIndexes();
        }

        console.log(
            `✅ Migration complete${DRY_RUN ? ' (dry run, nothing written)' : ''}.`
        );
    } finally {
        await disconnectFromDatabase();
    }
}

main().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
});
