import { Request, Response } from 'express';

jest.mock('../../models/Event', () => {
    const actual = jest.requireActual('../../models/Event');
    return { __esModule: true, ...actual, default: { findOne: jest.fn() } };
});
jest.mock('../../models/Term', () => ({
    __esModule: true,
    default: { find: jest.fn(), findById: jest.fn() },
}));

import Event from '../../models/Event';
import Term from '../../models/Term';
import { getEventStats } from '../eventController';

const mockedEventFindOne = Event.findOne as jest.Mock;
const mockedTermFind = Term.find as jest.Mock;
const mockedTermFindById = Term.findById as jest.Mock;

const buildRes = () => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res as Response & { status: jest.Mock; json: jest.Mock };
};

const OWNER_ID = 'owner-id-1';
const GUEST_ID = 'guest-id-1';
const EVENT_ID = 'event-id-1';
const TERM_ID = 'term-id-1';

const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
};

/**
 * Builds a fake Event document whose `.populate()` reproduces real Mongoose
 * behavior for `populate({ path: 'attendees.id', model: 'User' })`: USER-kind
 * attendees resolve to a populated User object, but GUEST-kind attendees don't
 * exist in the User collection, so Mongoose leaves their id as `null`.
 * This null is exactly what used to crash getEventStats on `a.id.toString()`.
 */
const buildFakeEvent = () => {
    const event: any = {
        _id: EVENT_ID,
        uuid: 'evt-uuid',
        seasons: [],
        guests: [{ _id: GUEST_ID, firstName: 'Guest', lastName: 'Hostovic' }],
        attendees: [
            { id: OWNER_ID, kind: 'USER' },
            { id: GUEST_ID, kind: 'GUEST' },
        ],
    };
    event.populate = jest.fn(async (_opts: any) => {
        event.attendees = event.attendees.map((a: any) =>
            a.kind === 'USER'
                ? { ...a, id: { _id: OWNER_ID, firstName: 'Owner', lastName: 'Ownerson', preferNickname: false } }
                : { ...a, id: null }
        );
        return event;
    });
    return event;
};

/** Same null-on-populate behavior as above, but for a Term's attendees. */
const buildFakeTerm = () => ({
    _id: TERM_ID,
    eventId: EVENT_ID,
    date: yesterday(),
    startTime: '18:00',
    endTime: '20:00',
    attendees: [
        { id: OWNER_ID, kind: 'USER' },
        { id: GUEST_ID, kind: 'GUEST' },
    ],
    statistics: {
        teams: [
            { name: 'A', members: [{ id: OWNER_ID, kind: 'USER' }], wins: 1, draws: 0, losses: 0 },
            { name: 'B', members: [{ id: GUEST_ID, kind: 'GUEST' }], wins: 0, draws: 0, losses: 1 },
        ],
    },
});

describe('getEventStats — guest handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not crash when a guest attended a term for the first time (regression for null.toString() bug)', async () => {
        const fakeEvent = buildFakeEvent();
        const fakeTerm = buildFakeTerm();

        mockedEventFindOne.mockResolvedValue(fakeEvent);
        mockedTermFind.mockReturnValue({ sort: jest.fn().mockResolvedValue([fakeTerm]) });
        mockedTermFindById.mockReturnValue({
            populate: jest.fn().mockResolvedValue({
                toObject: () => ({
                    ...fakeTerm,
                    attendees: [
                        { id: { _id: OWNER_ID, firstName: 'Owner', lastName: 'Ownerson', preferNickname: false }, kind: 'USER' },
                        { id: null, kind: 'GUEST' },
                    ],
                }),
            }),
        });

        const req = { params: { uuid: 'evt-uuid' }, query: {} } as unknown as Request;
        const res = buildRes();

        await getEventStats(req, res);

        expect(res.status).not.toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledTimes(1);

        const body = res.json.mock.calls[0][0];
        const guestStats = body.stats.find((s: any) => s.kind === 'GUEST');

        expect(guestStats).toBeDefined();
        expect(guestStats.id).toBe(GUEST_ID);
        expect(guestStats.name).toBe('Guest Hostovic');
        expect(guestStats.attendance).toBe(1);
        expect(guestStats.losses).toBe(1);
    });
});
