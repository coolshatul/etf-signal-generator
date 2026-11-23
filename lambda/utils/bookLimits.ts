// Pure book-construction rules, kept separate from the handler so they can be
// tested without network access.

import { etfExposureGroup } from './common';

export interface BookState {
    count: number;
    byGroup: Record<string, number>;
}

export interface BookLimits {
    maxOpenPositions: number;
    maxPerGroup: number;
}

export interface BookSelection<T> {
    accepted: T[];
    skippedSlots: number;
    skippedGroup: number;
}

/**
 * Choose which of today's candidates can be added to the book.
 * Highest-rated setups win the available slots; correlated ETFs share an
 * exposure group so one theme cannot fill the book.
 */
export function selectWithinBookLimits<T extends { symbol: string; rating: number }>(
    candidates: T[],
    book: BookState,
    limits: BookLimits
): BookSelection<T> {
    const slots = Math.max(0, limits.maxOpenPositions - book.count);
    const groupCounts = { ...book.byGroup };
    const accepted: T[] = [];
    let skippedSlots = 0;
    let skippedGroup = 0;

    const ranked = [...candidates].sort((a, b) => b.rating - a.rating);

    for (const candidate of ranked) {
        if (accepted.length >= slots) {
            skippedSlots++;
            continue;
        }

        const group = etfExposureGroup(candidate.symbol);
        if ((groupCounts[group] ?? 0) >= limits.maxPerGroup) {
            skippedGroup++;
            continue;
        }

        accepted.push(candidate);
        groupCounts[group] = (groupCounts[group] ?? 0) + 1;
    }

    return { accepted, skippedSlots, skippedGroup };
}
