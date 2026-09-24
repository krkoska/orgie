/**
 * One-off cleanup for duplicate attendee entries created by the toggle-attendance
 * race condition (fixed in eventController.toggleTermAttendance / toggleEventAttendance).
 *
 * A duplicate is a repeated {id, kind} pair within the same attendees/members array;
 * the first occurrence is kept, later ones are dropped.
 *
 * Cleans:
 *   - Term.attendees
 *   - Term.statistics.teams[].members (prevents double-counted wins/draws/losses)
 *   - Event.attendees
 *
 * Usage (from server/):
 *   npx ts-node src/scripts/dedupeAttendees.ts            # dry run, only reports what it would change
 *   npx ts-node src/scripts/dedupeAttendees.ts --apply    # actually writes the changes
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db';
import Term from '../models/Term';
import Event from '../models/Event';
import logger from '../utils/logger';
import { dedupe } from './dedupeAttendeesCore';

dotenv.config();

const APPLY = process.argv.includes('--apply');

async function run() {
    await connectDB();
    logger.info(`Starting attendee dedup migration (${APPLY ? 'APPLY' : 'DRY RUN, pass --apply to write changes'})`);

    // --- Terms: attendees + statistics.teams[].members ---
    const terms = await Term.find({}).lean();
    const termBulkOps: any[] = [];
    let termsChanged = 0;
    let termAttendeesRemoved = 0;
    let teamMembersRemoved = 0;

    for (const term of terms as any[]) {
        const update: any = {};
        let changed = false;

        const { deduped: dedupedAttendees, removed: attendeesRemoved } = dedupe(term.attendees || []);
        if (attendeesRemoved > 0) {
            update.attendees = dedupedAttendees;
            termAttendeesRemoved += attendeesRemoved;
            changed = true;
            logger.info('Duplicate attendees found on term', {
                termId: term._id.toString(),
                eventId: term.eventId?.toString(),
                date: term.date,
                removed: attendeesRemoved
            });
        }

        if (term.statistics?.teams?.length > 0) {
            let statsChanged = false;
            const teams = term.statistics.teams.map((team: any) => {
                const { deduped: dedupedMembers, removed: membersRemoved } = dedupe(team.members || []);
                if (membersRemoved > 0) {
                    statsChanged = true;
                    teamMembersRemoved += membersRemoved;
                    logger.info('Duplicate team members found in term statistics (would have double-counted wins/losses)', {
                        termId: term._id.toString(),
                        team: team.name,
                        removed: membersRemoved
                    });
                }
                return { ...team, members: dedupedMembers };
            });
            if (statsChanged) {
                update.statistics = { ...term.statistics, teams };
                changed = true;
            }
        }

        if (changed) {
            termsChanged++;
            if (APPLY) {
                termBulkOps.push({ updateOne: { filter: { _id: term._id }, update: { $set: update } } });
            }
        }
    }

    if (APPLY && termBulkOps.length > 0) {
        await Term.bulkWrite(termBulkOps);
    }

    // --- Events: attendees ---
    const events = await Event.find({}).lean();
    const eventBulkOps: any[] = [];
    let eventsChanged = 0;
    let eventAttendeesRemoved = 0;

    for (const event of events as any[]) {
        const { deduped, removed } = dedupe(event.attendees || []);
        if (removed > 0) {
            eventsChanged++;
            eventAttendeesRemoved += removed;
            logger.info('Duplicate attendees found on event', {
                eventId: event._id.toString(),
                name: event.name,
                removed
            });
            if (APPLY) {
                eventBulkOps.push({ updateOne: { filter: { _id: event._id }, update: { $set: { attendees: deduped } } } });
            }
        }
    }

    if (APPLY && eventBulkOps.length > 0) {
        await Event.bulkWrite(eventBulkOps);
    }

    logger.info('Dedup migration summary', {
        mode: APPLY ? 'APPLY (written)' : 'DRY RUN (nothing written, pass --apply to write)',
        termsChanged,
        termAttendeesRemoved,
        teamMembersRemoved,
        eventsChanged,
        eventAttendeesRemoved
    });

    await mongoose.disconnect();
    process.exit(0);
}

if (require.main === module) {
    run().catch((err) => {
        logger.error('Dedup migration failed', { error: err.message });
        process.exit(1);
    });
}
