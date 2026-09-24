import { dedupe } from '../dedupeAttendeesCore';

describe('dedupe', () => {
    it('keeps a list with no duplicates unchanged', () => {
        const items = [
            { id: 'u1', kind: 'USER' as const },
            { id: 'u2', kind: 'USER' as const },
            { id: 'g1', kind: 'GUEST' as const }
        ];

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(0);
        expect(deduped).toEqual(items);
    });

    it('drops later occurrences of the same id+kind pair, keeping the first', () => {
        const first = { id: 'u1', kind: 'USER' as const, note: 'first' };
        const items = [
            first,
            { id: 'u2', kind: 'USER' as const },
            { id: 'u1', kind: 'USER' as const, note: 'duplicate' },
            { id: 'u1', kind: 'USER' as const, note: 'duplicate again' }
        ];

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(2);
        expect(deduped).toEqual([first, { id: 'u2', kind: 'USER' }]);
    });

    it('reproduces the reported bug: same person appearing 2-3x in a term', () => {
        const dusan = { id: 'user-dusan', kind: 'USER' as const };
        const items = [
            { id: 'user-lubo', kind: 'USER' as const },
            dusan,
            dusan,
            dusan,
            { id: 'user-marek', kind: 'USER' as const }
        ];

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(2);
        expect(deduped.filter(a => a.id === 'user-dusan')).toHaveLength(1);
    });

    it('treats the same id with a different kind as a distinct attendee (not a duplicate)', () => {
        const items = [
            { id: 'shared-id', kind: 'USER' as const },
            { id: 'shared-id', kind: 'GUEST' as const }
        ];

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(0);
        expect(deduped).toHaveLength(2);
    });

    it('works on ObjectId-like values by comparing via toString()', () => {
        const makeId = (hex: string) => ({ toString: () => hex });
        const items = [
            { id: makeId('507f1f77bcf86cd799439011'), kind: 'USER' as const },
            { id: makeId('507f1f77bcf86cd799439011'), kind: 'USER' as const }
        ];

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(1);
        expect(deduped).toHaveLength(1);
    });

    it('leaves entries without an id untouched (not treated as duplicates of each other)', () => {
        const items = [
            { id: null, kind: 'USER' as const },
            { id: undefined, kind: 'USER' as const }
        ] as any;

        const { deduped, removed } = dedupe(items);

        expect(removed).toBe(0);
        expect(deduped).toHaveLength(2);
    });

    it('handles an empty list', () => {
        const { deduped, removed } = dedupe([]);

        expect(removed).toBe(0);
        expect(deduped).toEqual([]);
    });
});
