/**
 * Pure dedup logic used by dedupeAttendees.ts, split out so it can be unit
 * tested without connecting to a database.
 *
 * A duplicate is a repeated {id, kind} pair; the first occurrence is kept.
 */
export type AttendeeLike = { id: any; kind: 'USER' | 'GUEST'; [key: string]: any };

export function dedupe<T extends AttendeeLike>(items: T[]): { deduped: T[]; removed: number } {
    const seen = new Set<string>();
    const deduped: T[] = [];
    let removed = 0;

    for (const item of items || []) {
        if (!item || !item.id) {
            deduped.push(item);
            continue;
        }
        const key = `${item.kind}-${item.id.toString()}`;
        if (seen.has(key)) {
            removed++;
            continue;
        }
        seen.add(key);
        deduped.push(item);
    }

    return { deduped, removed };
}
