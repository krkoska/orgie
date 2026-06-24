import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Event, { EventType, ISeason, RecurrenceFrequency } from '../models/Event';
import Term from '../models/Term';
import logger from '../utils/logger';

const validateSeasons = (seasons: ISeason[]) => {
    if (!seasons || seasons.length === 0) return;

    // Sort seasons by startDate to make overlap check easier
    const sortedSeasons = [...seasons].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    for (let i = 0; i < sortedSeasons.length; i++) {
        const season = sortedSeasons[i];
        const start = new Date(season.startDate);
        const end = season.endDate ? new Date(season.endDate) : null;

        if (!season.name) throw new Error('Season name is required');
        if (isNaN(start.getTime())) throw new Error(`Invalid start date for season: ${season.name}`);
        if (end && isNaN(end.getTime())) throw new Error(`Invalid end date for season: ${season.name}`);

        if (end && start > end) {
            throw new Error(`Start date must be before end date for season: ${season.name}`);
        }

        // Overlap check
        if (i > 0) {
            const prevSeason = sortedSeasons[i - 1];
            const prevEnd = prevSeason.endDate ? new Date(prevSeason.endDate) : null;

            if (!prevEnd) {
                throw new Error(`Only the latest season can have no end date. Season "${prevSeason.name}" must have an end date because "${season.name}" starts after it.`);
            }

            if (start <= prevEnd) {
                throw new Error(`Seasons overlap: "${prevSeason.name}" and "${season.name}"`);
            }
        }
    }
};

const getUniqueAttendees = <T extends { id: any; kind: 'USER' | 'GUEST' }>(attendees: T[]): T[] => {
    const seen = new Set<string>();
    return attendees.filter(a => {
        if (!a.id) return false;
        const id = typeof a.id === 'object' && a.id._id ? a.id._id : a.id;
        const idStr = id.toString();
        if (seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
    });
};

function computeStreaks(results: ('WIN' | 'LOSS' | 'DRAW')[]): {
    currentWinStreak: number;
    currentLossStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
} {
    let tempWin = 0, tempLoss = 0, longestWin = 0, longestLoss = 0;
    for (const r of results) {
        if (r === 'WIN') {
            tempWin++;
            tempLoss = 0;
            if (tempWin > longestWin) longestWin = tempWin;
        } else if (r === 'LOSS') {
            tempLoss++;
            tempWin = 0;
            if (tempLoss > longestLoss) longestLoss = tempLoss;
        } else {
            tempWin = 0;
            tempLoss = 0;
        }
    }
    return { currentWinStreak: tempWin, currentLossStreak: tempLoss, longestWinStreak: longestWin, longestLossStreak: longestLoss };
}

export const createEvent = async (req: Request, res: Response) => {
    try {
        const { name, place, type, startTime, endTime, date, recurrence, administrators, minAttendees, maxAttendees, activityType, seasons } = req.body;
        const ownerId = (req as any).user._id;

        // Custom validation
        try {
            validateSeasons(seasons);
        } catch (err: any) {
            return res.status(400).json({ message: err.message });
        }

        if (type === EventType.ONE_TIME) {
            if (!date) {
                return res.status(400).json({ message: 'Date is required for ONE_TIME events' });
            }
            const eventDate = new Date(date);
            if (eventDate < new Date()) {
                return res.status(400).json({ message: 'Date must be in the future for ONE_TIME events' });
            }
        }

        if (type === EventType.RECURRING && !recurrence) {
            return res.status(400).json({ message: 'Recurrence details are required for RECURRING events' });
        }

        const uuid = uuidv4();
        const administratorsList = administrators || [];
        if (!administratorsList.includes(ownerId.toString())) {
            administratorsList.push(ownerId.toString());
        }

        const event = await Event.create({
            name,
            place,
            ownerId,
            type,
            startTime,
            endTime,
            date,
            recurrence,
            uuid,
            activityType,
            administrators: administratorsList,
            minAttendees: minAttendees || 0,
            maxAttendees: maxAttendees || 0,
            seasons: seasons || [],
            attendees: []
        });

        logger.info('Event created', { eventId: event._id, uuid: event.uuid, userId: ownerId });

        if (type === EventType.ONE_TIME && date) {
            await Term.create({
                eventId: event._id,
                date: new Date(date),
                startTime,
                endTime,
                attendees: []
            });
        }

        res.status(201).json(event);
    } catch (error: any) {
        logger.error('Error creating event', { error: error.message, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const getEvents = async (req: Request, res: Response) => {
    try {
        const events = await Event.find().populate('ownerId', 'firstName lastName nickname preferNickname email');
        res.json(events);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getDashboardEvents = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        // Managed: owned by user OR user is in administrators
        const managed = await Event.find({
            $or: [
                { ownerId: userId },
                { administrators: userId }
            ]
        }).populate('ownerId', 'firstName lastName nickname preferNickname email')
            .populate('administrators', 'firstName lastName nickname preferNickname email');

        // Attending: user is in attendees of any Term related to the Event OR in Event.attendees
        const attendingTerms = await Term.find({ "attendees.id": userId }).select('eventId');
        const eventIdsFromTerms = attendingTerms.map((t: any) => t.eventId);

        const attending = await Event.find({
            $or: [
                { _id: { $in: eventIdsFromTerms } },
                { "attendees.id": userId }
            ]
        }).populate('ownerId', 'firstName lastName nickname preferNickname email')
            .populate('administrators', 'firstName lastName nickname preferNickname email');

        res.json({ managed, attending });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMyEvents = async (req: Request, res: Response) => {
    try {
        const ownerId = (req as any).user._id;
        const events = await Event.find({ ownerId })
            .populate('ownerId', 'firstName lastName nickname preferNickname email')
            .populate('administrators', 'firstName lastName nickname preferNickname email');
        res.json(events);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteEvent = async (req: Request, res: Response) => {
    try {
        const event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const user = (req as any).user;

        if (event.ownerId.toString() !== user._id.toString()) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        await Term.deleteMany({ eventId: event._id }); // Delete all associated terms
        await event.deleteOne();

        logger.info('Event deleted', { eventId: event._id, uuid: event.uuid, userId: (req as any).user._id });
        res.status(200).json({ message: 'Event and associated terms deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting event', { error: error.message, eventId: req.params.id, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const updateEvent = async (req: Request, res: Response) => {
    try {
        const { name, place, type, startTime, endTime, date, recurrence, administrators, minAttendees, maxAttendees, activityType, seasons } = req.body;

        let event = await Event.findById(req.params.id);

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const user = (req as any).user;

        // Check ownership or admin status
        const isAdmin = event.administrators.some(adminId => adminId && adminId.toString() === user._id.toString());
        const isOwner = event.ownerId && event.ownerId.toString() === user._id.toString();

        if (!isOwner && !isAdmin) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        // Validation
        try {
            validateSeasons(seasons || event.seasons);
        } catch (err: any) {
            return res.status(400).json({ message: err.message });
        }

        if (type === EventType.ONE_TIME) {
            if (!date) {
                return res.status(400).json({ message: 'Date is required for ONE_TIME events' });
            }
        }

        if (type === EventType.RECURRING && !recurrence) {
            return res.status(400).json({ message: 'Recurrence details are required for RECURRING events' });
        }

        const eventData: any = {
            name: name || event.name,
            place: place || event.place,
            type: type || event.type,
            startTime: startTime || event.startTime,
            endTime: endTime || event.endTime,
        };

        let administratorsList = administrators || event.administrators;
        const ownerIdStr = event.ownerId.toString();
        const adminIdsStr = administratorsList.map((id: any) => id.toString());

        if (!adminIdsStr.includes(ownerIdStr)) {
            administratorsList.push(event.ownerId);
        }
        eventData.administrators = administratorsList;

        if (minAttendees !== undefined) eventData.minAttendees = minAttendees;
        if (maxAttendees !== undefined) eventData.maxAttendees = maxAttendees;
        if (activityType !== undefined) eventData.activityType = activityType;
        if (seasons !== undefined) eventData.seasons = seasons;

        if (type === EventType.ONE_TIME) {
            eventData.date = date;
            eventData.recurrence = undefined;
        } else if (type === EventType.RECURRING) {
            eventData.recurrence = recurrence;
            eventData.date = undefined;
        }

        const updatedEvent = await Event.findOneAndUpdate(
            { _id: req.params.id },
            eventData,
            { new: true }
        );

        logger.info('Event updated', { eventId: updatedEvent?._id, uuid: updatedEvent?.uuid, userId: (req as any).user._id });
        res.status(200).json(updatedEvent);
    } catch (error: any) {
        logger.error('Error updating event', { error: error.message, eventId: req.params.id, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const getEventByUuid = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const originalEventAttendees = JSON.parse(JSON.stringify(event.attendees));

        const populatedEvent = await Event.findById(event._id)
            .populate('ownerId', 'firstName lastName nickname preferNickname email')
            .populate('administrators', 'firstName lastName nickname preferNickname email')
            .populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname email'
            })
            .populate('guests.addedBy', 'firstName lastName nickname preferNickname');

        if (populatedEvent) {
            (populatedEvent.attendees as any) = (populatedEvent.attendees as any).map((a: any, idx: number) => {
                if (a.id === null || a.id === undefined) {
                    // Restore original ID if population wiped it (e.g. deleted user or guest)
                    const origId = originalEventAttendees[idx]?.id;
                    return { ...a, id: origId ? origId.toString() : null };
                }
                return a;
            });
        }

        // Fetch active terms (today and future)
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        // Find terms that are in the future OR today but haven't ended yet
        const terms = await Term.find({
            eventId: event._id,
            date: { $gte: today }
        }).sort({ date: 1 });

        // Helper to get "wall clock" pieces in Prague time (assuming CET/CEST)
        const getWallClock = (date: Date) => {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Europe/Prague',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).formatToParts(date);

            const find = (type: string) => parts.find(p => p.type === type)?.value;
            return {
                dateStr: `${find('year')}-${find('month')}-${find('day')}`,
                timeStr: `${find('hour')}:${find('minute')}`
            };
        };

        const currentWallClock = getWallClock(now);

        const activeTerms = terms.filter(t => {
            const termDateStr = new Date(t.date).toISOString().split('T')[0];

            if (termDateStr > currentWallClock.dateStr) return true; // Future day
            if (termDateStr < currentWallClock.dateStr) return false; // Past day

            // Same day, compare time strings
            return currentWallClock.timeStr < t.endTime;
        });

        const originalTermsAttendees = activeTerms.map(t => JSON.parse(JSON.stringify(t.attendees)));

        const populatedTerms = await Promise.all(activeTerms.map((t, tIdx) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname email'
            }).then(pt => {
                if (pt) {
                    (pt.attendees as any) = (pt.attendees as any).map((a: any, aIdx: number) => {
                        if (a.id === null || a.id === undefined) {
                            const origId = originalTermsAttendees[tIdx][aIdx]?.id;
                            return { ...a, id: origId ? origId.toString() : null };
                        }
                        return a;
                    });
                }
                return pt;
            })
        ));

        res.json({ event: populatedEvent, terms: populatedTerms });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const generateTerms = async (req: Request, res: Response) => {
    try {
        const { eventId, startDate, endDate } = req.body;

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const user = (req as any).user;
        const isAdmin = event.administrators.some(adminId => adminId && adminId.toString() === user._id.toString());
        const isOwner = event.ownerId && event.ownerId.toString() === user._id.toString();

        if (!isOwner && !isAdmin) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        if (event.type !== EventType.RECURRING || !event.recurrence) {
            return res.status(400).json({ message: 'Event is not recurring' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const termsToInsert = [];

        const { frequency, weekDays = [] } = event.recurrence;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            let shouldInclude = false;

            if (frequency === RecurrenceFrequency.DAILY) {
                shouldInclude = true;
            } else if (frequency === RecurrenceFrequency.WEEKLY) {
                shouldInclude = weekDays.includes(d.getDay());
            }

            if (shouldInclude) {
                termsToInsert.push({
                    eventId: event._id,
                    date: new Date(d),
                    startTime: event.startTime,
                    endTime: event.endTime,
                    attendees: []
                });
            }
        }

        if (termsToInsert.length === 0) {
            logger.info('No terms to generate', { eventId: event._id, startDate, endDate, userId: (req as any).user._id });
            return res.json({ message: 'No terms to generate for selected date range', inserted: 0, skipped: 0 });
        }

        // Check for existing terms to avoid duplicates
        const existingTerms = await Term.find({
            eventId: event._id,
            date: { $in: termsToInsert.map(t => t.date) }
        });

        const existingDates = new Set(existingTerms.map(t => t.date.toISOString().split('T')[0]));
        const newTerms = termsToInsert.filter(t => {
            const dateStr = new Date(t.date).toISOString().split('T')[0];
            return !existingDates.has(dateStr);
        });

        const skipped = termsToInsert.length - newTerms.length;

        if (newTerms.length > 0) {
            await Term.insertMany(newTerms);
        }

        logger.info('Terms generated', { eventId: event._id, inserted: newTerms.length, skipped: skipped, userId: (req as any).user._id });
        res.json({
            message: 'Terms generated successfully',
            inserted: newTerms.length,
            skipped: skipped,
            total: termsToInsert.length
        });

    } catch (error: any) {
        logger.error('Error generating terms', { error: error.message, eventId: req.body.eventId, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const deleteTerm = async (req: Request, res: Response) => {
    try {
        const term = await Term.findById(req.params.id);

        if (!term) {
            return res.status(404).json({ message: 'Term not found' });
        }

        // Get the event to check permissions
        const event = await Event.findById(term.eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const user = (req as any).user;
        const isOwner = event.ownerId && event.ownerId.toString() === user._id.toString();
        const isAdmin = event.administrators.some(adminId => adminId && adminId.toString() === user._id.toString());

        if (!isOwner && !isAdmin) {
            return res.status(401).json({ message: 'User not authorized' });
        }

        await Term.findByIdAndDelete(req.params.id);
        logger.info('Term deleted', { termId: req.params.id, eventId: event._id, userId: (req as any).user._id });
        res.status(200).json({ message: 'Term deleted successfully' });
    } catch (error: any) {
        logger.error('Error deleting term', { error: error.message, termId: req.params.id, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const toggleTermAttendance = async (req: Request, res: Response) => {
    try {
        const term = await Term.findById(req.params.termId);

        if (!term) {
            return res.status(404).json({ message: 'Term not found' });
        }

        const requesterId = (req as any).user._id;
        const targetUserId = (req.body && req.body.userId) || requesterId.toString();
        const kind = (req.body && req.body.kind) || 'USER';

        // Check permissions
        if (targetUserId.toString() !== requesterId.toString()) {
            const event = await mongoose.model('Event').findById(term.eventId);
            if (!event) return res.status(404).json({ message: 'Event not found' });

            const isOwner = event.ownerId.toString() === requesterId.toString();
            const isAdmin = event.administrators.some((id: any) => id.toString() === requesterId.toString());

            // Check if it's a guest added by requester
            const isGuestPatron = kind === 'GUEST' && event.guests.some((g: any) =>
                g._id.toString() === targetUserId.toString() && g.addedBy.toString() === requesterId.toString()
            );

            if (!isOwner && !isAdmin && !isGuestPatron) {
                return res.status(403).json({ message: 'Not authorized to manage this attendee' });
            }
        }

        const originalAttendees = JSON.parse(JSON.stringify(term.attendees));

        // Atomic toggle using deterministic check
        const isAttending = term.attendees.some((a: any) =>
            a.id && a.id.toString() === targetUserId && a.kind === kind
        );

        if (isAttending) {
            await Term.updateOne(
                { _id: term._id },
                { $pull: { attendees: { id: targetUserId, kind: kind } } }
            );
        } else {
            const event = await mongoose.model('Event').findById(term.eventId);
            if (event && event.maxAttendees) {
                // Calculate unique count including current state
                const uniqueIds = new Set(term.attendees.map((a: any) =>
                    (a.id && a.id.toString()) || null
                ).filter(id => id !== null));

                if (uniqueIds.size >= event.maxAttendees) {
                    return res.status(400).json({ message: 'Term is full' });
                }
            }

            await Term.updateOne(
                { _id: term._id },
                { $push: { attendees: { id: targetUserId, kind: kind } } }
            );
        }

        // Populate attendees for response
        const populatedTerm = await Term.findById(term._id).populate({
            path: 'attendees.id',
            model: 'User',
            select: 'firstName lastName nickname preferNickname email'
        });

        if (populatedTerm) {
            (populatedTerm.attendees as any) = (populatedTerm.attendees as any).map((a: any) => {
                if (a.id === null || a.id === undefined) {
                    const orig = (originalAttendees as any[]).find(
                        (o: any) => o._id?.toString() === a._id?.toString()
                    );
                    return orig ? { ...a, id: orig.id?.toString() ?? null } : a;
                }
                return a;
            });
        }

        res.json({
            message: 'Attendance toggled',
            term: populatedTerm
        });
    } catch (error: any) {
        logger.error('Error toggling term attendance', { error: error.message, termId: req.params.termId, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const toggleEventAttendance = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const user = (req as any).user;
        const requesterId = user._id;
        const targetUserId = (req.body && req.body.userId) || requesterId.toString();
        const kind = (req.body && req.body.kind) || 'USER';

        // Check permissions
        if (targetUserId.toString() !== requesterId.toString()) {
            const isOwner = event.ownerId.toString() === requesterId.toString();
            const isAdmin = event.administrators.some((id: any) => id.toString() === requesterId.toString());
            const isGuestPatron = kind === 'GUEST' && event.guests.some((g: any) =>
                g._id.toString() === targetUserId.toString() && g.addedBy.toString() === requesterId.toString()
            );

            if (!isOwner && !isAdmin && !isGuestPatron) {
                return res.status(403).json({ message: 'Not authorized to manage this attendee' });
            }
        }

        // Better logic: use the loaded document to check presence
        const isAttending = event.attendees.some((a: any) =>
            a.id && a.id.toString() === targetUserId && a.kind === kind
        );

        const originalAttendees = JSON.parse(JSON.stringify(event.attendees));

        if (isAttending) {
            await Event.updateOne(
                { _id: event._id },
                { $pull: { attendees: { id: targetUserId, kind: kind } } }
            );
        } else {
            await Event.updateOne(
                { _id: event._id },
                { $push: { attendees: { id: targetUserId, kind: kind } } }
            );
        }

        const updatedEvent = await Event.findById(event._id).populate({
            path: 'attendees.id',
            model: 'User',
            select: 'firstName lastName nickname preferNickname email'
        });

        if (updatedEvent) {
            (updatedEvent.attendees as any) = (updatedEvent.attendees as any).map((a: any) => {
                if (a.id === null || a.id === undefined) {
                    const orig = (originalAttendees as any[]).find(
                        (o: any) => o._id?.toString() === a._id?.toString()
                    );
                    return orig ? { ...a, id: orig.id?.toString() ?? null } : a;
                }
                return a;
            });
        }

        res.json({ attendees: updatedEvent?.attendees || [] });
    } catch (error: any) {
        logger.error('Error toggling event attendance', { error: error.message, eventUuid: req.params.uuid, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const getArchivedTerms = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);

        // Find terms that are in the past (before today) OR today but have already ended
        const allTermsBeforeOrToday = await Term.find({
            eventId: event._id,
            date: { $lt: nextDay }
        }).sort({ date: -1 });

        const currentWallClock = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Prague',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).formatToParts(now);

        const find = (type: string) => currentWallClock.find(p => p.type === type)?.value;
        const nowDateStr = `${find('year')}-${find('month')}-${find('day')}`;
        const nowTimeStr = `${find('hour')}:${find('minute')}`;

        const archivedTerms = allTermsBeforeOrToday.filter(t => {
            const termDateStr = new Date(t.date).toISOString().split('T')[0];

            if (termDateStr < nowDateStr) return true; // Definitely past
            if (termDateStr > nowDateStr) return false; // Definitely future

            // Same day, check if end time has passed
            return nowTimeStr >= t.endTime;
        });

        const originalAttendeesPerTerm = archivedTerms.map((t: any) => JSON.parse(JSON.stringify(t.attendees)));

        const populatedTerms = await Promise.all(archivedTerms.map((t: any) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname email'
            })
        ));

        const fixedTerms = populatedTerms.map((t: any, tIdx: number) => {
            if (!t) return null;
            const termObj = t.toObject();
            termObj.attendees = termObj.attendees.map((a: any, aIdx: number) => {
                if (a.id === null || a.id === undefined) {
                    const origId = originalAttendeesPerTerm[tIdx][aIdx]?.id;
                    return { ...a, id: origId ? origId.toString() : null };
                }
                return a;
            });
            return termObj;
        });

        res.json(fixedTerms);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteArchivedTerms = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate } = req.body;
        const event = await Event.findOne({ uuid: req.params.uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Permission check
        const userId = (req as any).user._id.toString();
        const isOwner = event.ownerId.toString() === userId;
        const isAdmin = event.administrators.some(admin => admin.toString() === userId);

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to manage this event' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const filterEndDate = new Date(endDate);
        filterEndDate.setHours(0, 0, 0, 0);

        // Safety check: endDate must be < today
        if (filterEndDate >= today) {
            return res.status(400).json({ message: 'End date must be in the past' });
        }

        const result = await Term.deleteMany({
            eventId: event._id,
            date: {
                $gte: new Date(startDate),
                $lte: filterEndDate
            }
        });

        logger.info('Archived terms bulk deleted', { eventId: event._id, count: result.deletedCount, userId: (req as any).user._id });
        res.json({ message: `Successfully deleted ${result.deletedCount} archived terms`, deletedCount: result.deletedCount });
    } catch (error: any) {
        logger.error('Error bulk deleting archived terms', { error: error.message, eventUuid: req.params.uuid, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const removeAttendeeFromEvent = async (req: Request, res: Response) => {
    try {
        const { uuid } = req.params;
        const event = await Event.findOne({ uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const userId = req.params.userId;
        const kind = req.query.kind === 'GUEST' ? 'GUEST' : 'USER';
        const requesterId = (req as any).user._id.toString();

        const isOwner = event.ownerId.toString() === requesterId;
        const isAdmin = event.administrators.some(id => id.toString() === requesterId);

        // Check if it's a guest of the requester
        const isGuestPatron = kind === 'GUEST' && event.guests.some((g: any) =>
            g._id.toString() === userId && g.addedBy.toString() === requesterId
        );

        // Permission: Self-removal OR Admin/Owner removal OR Patron removal of guest
        if (requesterId !== userId && !isAdmin && !isOwner && !isGuestPatron) {
            return res.status(401).json({ message: 'User not authorized to remove this attendee' });
        }

        // 1. Remove from Event.attendees
        event.attendees = (event.attendees as any[]).filter(a => !(a.id.toString() === userId && a.kind === kind));

        // 2. If it was a guest, remove from Event.guests
        if (kind === 'GUEST') {
            event.guests = (event.guests as any[]).filter(g => g._id.toString() !== userId);
        }

        await event.save();

        // 3. Remove from all Terms related to this Event
        await Term.updateMany(
            { eventId: event._id },
            { $pull: { attendees: { id: userId, kind: kind } } }
        );

        logger.info('Attendee removed from event and terms', { eventId: event._id, removedUserId: userId, kind, requesterId });
        res.json({ message: 'Attendee removed successfully' });
    } catch (error: any) {
        logger.error('Error removing attendee', { error: error.message, eventUuid: req.params.uuid, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const addGuestToEvent = async (req: Request, res: Response) => {
    try {
        const { uuid } = req.params;
        const { firstName, lastName } = req.body;

        const event = await Event.findOne({ uuid });
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const requesterId = (req as any).user._id;

        // Create embedded guest sub-document
        const newGuest = {
            firstName,
            lastName,
            addedBy: requesterId
        };

        event.guests.push(newGuest as any);
        const guestDoc = event.guests[event.guests.length - 1]; // Get the created guest with its _id

        // Add to event attendees
        event.attendees.push({ id: guestDoc._id, kind: 'GUEST' });
        await event.save();

        logger.info('Guest added to event', { eventId: event._id, guestId: guestDoc._id, addedBy: requesterId });

        res.status(201).json(guestDoc);
    } catch (error: any) {
        logger.error('Error adding guest to event', { error: error.message, eventUuid: req.params.uuid, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

export const updateTermStatistics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { statistics } = req.body;

        const term = await Term.findById(id);
        if (!term) {
            return res.status(404).json({ message: 'Term not found' });
        }

        const event = await Event.findById(term.eventId);
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const user = (req as any).user;
        const isAdmin = event.administrators.some((adminId: any) => adminId && adminId.toString() === user._id.toString());
        const isOwner = event.ownerId && event.ownerId.toString() === user._id.toString();

        if (!isOwner && !isAdmin) {
            return res.status(401).json({ message: 'User not authorized to update statistics' });
        }

        term.statistics = statistics;
        await term.save();

        logger.info('Term statistics updated', { termId: term._id, eventId: event._id, userId: user._id });
        res.json({ message: 'Statistics updated successfully', statistics: term.statistics });
    } catch (error: any) {
        logger.error('Error updating term statistics', { error: error.message, termId: req.params.id, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};

// Vrací archivované termíny pro daný event, populate attendees.id
const getPopulatedArchivedTerms = async (
    eventId: string,
    seasonIdx: number | null
): Promise<{ fixedTerms: any[]; event: any }> => {
    const event = await Event.findById(eventId)
        .populate('ownerId', 'firstName lastName nickname preferNickname')
        .populate('administrators', 'firstName lastName nickname preferNickname');
    if (!event) throw new Error('Event not found');

    const eventObj = (event as any).toObject ? (event as any).toObject() : event;

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const nextDay = new Date(today);
    nextDay.setDate(nextDay.getDate() + 1);

    const allTermsBeforeOrToday = await Term.find({
        eventId: eventId,
        date: { $lt: nextDay }
    }).sort({ date: 1 });

    const currentWallClock = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Prague',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now);

    const findPart = (type: string) => currentWallClock.find(p => p.type === type)?.value;
    const nowDateStr = `${findPart('year')}-${findPart('month')}-${findPart('day')}`;
    const nowTimeStr = `${findPart('hour')}:${findPart('minute')}`;

    let archivedTerms = allTermsBeforeOrToday.filter((t: any) => {
        const termDateStr = new Date(t.date).toISOString().split('T')[0];
        if (termDateStr < nowDateStr) return true;
        if (termDateStr > nowDateStr) return false;
        return nowTimeStr >= t.endTime;
    });

    // Season filtering with proper end-of-day normalization
    if (seasonIdx !== null && eventObj.seasons && eventObj.seasons[seasonIdx]) {
        const season = eventObj.seasons[seasonIdx];
        const start = new Date(season.startDate);
        start.setHours(0, 0, 0, 0);
        const end = season.endDate ? new Date(season.endDate) : new Date(8640000000000000);
        if (season.endDate) end.setHours(23, 59, 59, 999);
        archivedTerms = archivedTerms.filter((t: any) => {
            const d = new Date(new Date(t.date).toISOString().split('T')[0]);
            return d >= start && d <= end;
        });
    }

    const originalAttendeesPerTerm = archivedTerms.map((t: any) =>
        JSON.parse(JSON.stringify(t.attendees))
    );

    const populatedTerms = await Promise.all(
        archivedTerms.map((t: any) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname'
            })
        )
    );

    const fixedTerms = populatedTerms.map((t: any, tIdx: number) => {
        if (!t) return null;
        const termObj = t.toObject();
        termObj.attendees = termObj.attendees.map((a: any, aIdx: number) => {
            if (a.id === null || a.id === undefined) {
                const origId = originalAttendeesPerTerm[tIdx][aIdx]?.id;
                return { ...a, id: origId ? origId.toString() : null };
            }
            return a;
        });
        return termObj;
    }).filter(Boolean);

    return { fixedTerms, event: eventObj };
};

export const getAdvancedTeamStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const seasonIdx = req.query.seasonIdx !== undefined ? Number(req.query.seasonIdx) : null;
        const { fixedTerms, event: eventObj2 } = await getPopulatedArchivedTerms(
            (event._id as any).toString(),
            seasonIdx
        );

        // Helper: jméno účastníka
        const getName = (a: any): string => {
            const rawId = typeof a.id === 'object' && a.id !== null ? (a.id._id ?? a.id) : a.id;
            const idStr = rawId?.toString();

            if (a.kind === 'USER') {
                // Populated object directly on a.id
                if (typeof a.id === 'object' && a.id !== null && a.id.firstName) {
                    const u = a.id;
                    return u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                }
                // Fall back to event attendees list (populated)
                const evAtt = (eventObj2.attendees as any[]).find(
                    (ea: any) => ea.kind === 'USER' &&
                        (ea.id?._id?.toString() || ea.id?.toString()) === idStr
                );
                if (evAtt && typeof evAtt.id === 'object' && evAtt.id?.firstName) {
                    const u = evAtt.id;
                    return u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                }
                return 'Unknown';
            }

            // GUEST: look up by id in event.guests
            const guest = (eventObj2.guests as any[]).find((g: any) => g._id.toString() === idStr);
            if (guest) return `${guest.firstName} ${guest.lastName}`;
            return 'Guest';
        };
        const getKey = (a: any): string => {
            const id = typeof a.id === 'object' && a.id !== null ? (a.id._id ?? a.id).toString() : a.id;
            return `${a.kind}-${id}`;
        };

        // Mapa: klíč dvojice/trojice → { players, count, wins, gamesTotal }
        const pairsFreq = new Map<string, { players: {id:string,kind:string,name:string}[], count:number }>();
        const pairsWin  = new Map<string, { players: {id:string,kind:string,name:string}[], wins:number, total:number }>();
        const triosFreq = new Map<string, { players: {id:string,kind:string,name:string}[], count:number }>();
        const triosWin  = new Map<string, { players: {id:string,kind:string,name:string}[], wins:number, total:number }>();

        const termsWithStats = fixedTerms.filter((t: any) => t.statistics?.teams?.length > 0);

        for (const term of termsWithStats) {
            // Zjisti výsledek každého týmu
            const teams: { members: any[]; wins: number; draws: number; losses: number }[] = term.statistics.teams.map((team: any) => {
                // Populate member info z attendees
                const members = (team.members || []).map((m: any) => {
                    const idStr = m.id.toString();
                    const att = term.attendees.find(
                        (a: any) => a.kind === m.kind &&
                            (a.id?._id?.toString() || a.id?.toString()) === idStr
                    );
                    // Fall back to synthetic entry so the member still counts in pairs/trios
                    return att || { kind: m.kind, id: m.id };
                });

                return { members, wins: team.wins || 0, draws: team.draws || 0, losses: team.losses || 0 };
            });

            // Najdi vítěze (nejvíce výher; remíza = více týmů sdílí max)
            const maxWins = Math.max(...teams.map((t: any) => t.wins));
            const isWinner = (t: any) => maxWins > 0 && t.wins === maxWins;

            for (const team of teams as any[]) {
                const members = team.members;
                const won = isWinner(team);

                // Kombinace dvojic
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        const pair = [members[i], members[j]].sort((a, b) => getKey(a).localeCompare(getKey(b)));
                        const key = pair.map(getKey).join('|');
                        const players = pair.map(a => ({ id: getKey(a), kind: a.kind, name: getName(a) }));

                        if (!pairsFreq.has(key)) pairsFreq.set(key, { players, count: 0 });
                        pairsFreq.get(key)!.count++;

                        if (!pairsWin.has(key)) pairsWin.set(key, { players, wins: 0, total: 0 });
                        pairsWin.get(key)!.total++;
                        if (won) pairsWin.get(key)!.wins++;
                    }
                }

                // Kombinace trojic
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        for (let k = j + 1; k < members.length; k++) {
                            const trio = [members[i], members[j], members[k]].sort((a, b) => getKey(a).localeCompare(getKey(b)));
                            const key = trio.map(getKey).join('|');
                            const players = trio.map(a => ({ id: getKey(a), kind: a.kind, name: getName(a) }));

                            if (!triosFreq.has(key)) triosFreq.set(key, { players, count: 0 });
                            triosFreq.get(key)!.count++;

                            if (!triosWin.has(key)) triosWin.set(key, { players, wins: 0, total: 0 });
                            triosWin.get(key)!.total++;
                            if (won) triosWin.get(key)!.wins++;
                        }
                    }
                }
            }
        }

        const sortDesc = (arr: any[], key: string) => arr.sort((a, b) => b[key] - a[key]);
        const sortSuccessDesc = (arr: any[]) => arr.sort((a, b) => b.winPct - a.winPct || b.total - a.total);

        res.json({
            pairsFrequency: sortDesc(Array.from(pairsFreq.values()), 'count'),
            pairsSuccess: sortSuccessDesc(
                Array.from(pairsWin.values()).map(p => ({
                    players: p.players,
                    wins: p.wins,
                    total: p.total,
                    winPct: p.total > 0 ? Math.round((p.wins / p.total) * 1000) / 10 : 0
                }))
            ),
            triosFrequency: sortDesc(Array.from(triosFreq.values()), 'count'),
            triosSuccess: sortSuccessDesc(
                Array.from(triosWin.values()).map(p => ({
                    players: p.players,
                    wins: p.wins,
                    total: p.total,
                    winPct: p.total > 0 ? Math.round((p.wins / p.total) * 1000) / 10 : 0
                }))
            )
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getAdvancedAttendanceStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const seasonIdx = req.query.seasonIdx !== undefined ? Number(req.query.seasonIdx) : null;
        const { fixedTerms } = await getPopulatedArchivedTerms(
            (event._id as any).toString(),
            seasonIdx
        );

        // Pomocná: unikátní účastníci termínu
        const uniqueCount = (term: any): number => {
            const seen = new Set<string>();
            for (const a of term.attendees) {
                const key = a.kind === 'GUEST'
                    ? `GUEST-${a.id?.toString() || 'unknown'}`
                    : `USER-${a.id?._id?.toString() || a.id?.toString()}`;
                seen.add(key);
            }
            return seen.size;
        };

        // Timeline — každý termín s datem, týdnem, měsícem a počtem hráčů
        const locale = (req.query.lang as string) || 'cs';
        const monthNames: Record<string, string[]> = {
            cs: ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'],
            en: ['January','February','March','April','May','June','July','August','September','October','November','December']
        };
        const months = monthNames[locale] || monthNames['cs'];

        const timeline = fixedTerms.map((term: any, idx: number) => {
            const date = new Date(term.date);
            return {
                date: date.toISOString().slice(0, 10),
                week: idx + 1,
                month: months[date.getMonth()],
                attendeeCount: uniqueCount(term)
            };
        });

        // Distribuce podle počtu hráčů
        const byPlayerCountMap = new Map<number, number>();
        for (const t of fixedTerms) {
            const c = uniqueCount(t);
            byPlayerCountMap.set(c, (byPlayerCountMap.get(c) || 0) + 1);
        }
        const byPlayerCount = Array.from(byPlayerCountMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([count, terms]) => ({ count, terms }));

        // Distribuce podle počtu týmů
        const byTeamCountMap = new Map<number, number>();
        for (const t of fixedTerms) {
            if (t.statistics?.teams?.length > 0) {
                const n = t.statistics.teams.length;
                byTeamCountMap.set(n, (byTeamCountMap.get(n) || 0) + 1);
            }
        }
        const byTeamCount = Array.from(byTeamCountMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([teams, terms]) => ({ teams, terms }));

        res.json({ timeline, byPlayerCount, byTeamCount });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getEventStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid })
            .populate({ path: 'attendees.id', model: 'User', select: 'firstName lastName nickname preferNickname' });
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // --- Fetch archived terms (same logic as getArchivedTerms) ---
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);

        const allTermsBeforeOrToday = await Term.find({
            eventId: event._id,
            date: { $lt: nextDay }
        }).sort({ date: 1 });

        const currentWallClock = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Prague',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(now);

        const find = (type: string) => currentWallClock.find(p => p.type === type)?.value;
        const nowDateStr = `${find('year')}-${find('month')}-${find('day')}`;
        const nowTimeStr = `${find('hour')}:${find('minute')}`;

        let archivedTerms = allTermsBeforeOrToday.filter(t => {
            const termDateStr = new Date(t.date).toISOString().split('T')[0];
            if (termDateStr < nowDateStr) return true;
            if (termDateStr > nowDateStr) return false;
            return nowTimeStr >= t.endTime;
        });

        // --- Season filtering ---
        const { allSeasons, seasonIdx } = req.query;
        if (allSeasons !== 'true' && seasonIdx !== undefined && event.seasons.length > 0) {
            const idx = parseInt(seasonIdx as string, 10);
            if (isNaN(idx) || idx < 0 || idx >= event.seasons.length) {
                return res.status(400).json({ message: 'Invalid seasonIdx' });
            }
            const season = event.seasons[idx];
            if (season) {
                const start = new Date(season.startDate);
                start.setHours(0, 0, 0, 0);
                const end = season.endDate ? new Date(season.endDate) : new Date(8640000000000000);
                if (season.endDate) end.setHours(23, 59, 59, 999);
                archivedTerms = archivedTerms.filter(t => {
                    const d = new Date(new Date(t.date).toISOString().split('T')[0]);
                    return d >= start && d <= end;
                });
            }
        }

        // --- Populate attendees ---
        const originalAttendeesPerTerm = archivedTerms.map((t: any) => JSON.parse(JSON.stringify(t.attendees)));

        const populatedTerms = await Promise.all(archivedTerms.map((t: any) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname'
            })
        ));

        const fixedTerms = populatedTerms.map((t: any, tIdx: number) => {
            if (!t) return null;
            const termObj = t.toObject();
            termObj.attendees = termObj.attendees.map((a: any, aIdx: number) => {
                if (a.id === null || a.id === undefined) {
                    const origId = originalAttendeesPerTerm[tIdx][aIdx]?.id;
                    return { ...a, id: origId ? origId.toString() : null };
                }
                return a;
            });
            return termObj;
        }).filter(Boolean);

        const totalTerms = fixedTerms.length;
        const filledTermsCount = fixedTerms.filter((t: any) => t.statistics?.teams?.length > 0).length;

        // --- Aggregation ---
        const statsMap = new Map<string, {
            id: string; kind: 'USER' | 'GUEST'; name: string;
            attendance: number; wins: number; draws: number; losses: number; totalGames: number;
            results: ('WIN' | 'LOSS' | 'DRAW')[];
        }>();

        // Initialize from current event participants (event.attendees.id is populated)
        event.attendees.forEach((a: any) => {
            const populated = typeof a.id === 'object' && a.id !== null && a.id._id;
            const id = populated ? a.id._id.toString() : a.id.toString();
            const key = `${a.kind}-${id}`;
            if (!statsMap.has(key)) {
                let name = 'Unknown';
                if (a.kind === 'USER' && populated) {
                    const u = a.id;
                    name = u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                } else if (a.kind === 'GUEST') {
                    const guest = (event.guests as any[]).find((g: any) => g._id.toString() === id);
                    if (guest) name = `${guest.firstName} ${guest.lastName}`;
                }
                statsMap.set(key, { id, kind: a.kind, name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0, results: [] });
            }
        });
        (event.guests as any[]).forEach((g: any) => {
            const key = `GUEST-${g._id}`;
            if (!statsMap.has(key)) {
                const name = `${g.firstName} ${g.lastName}`;
                statsMap.set(key, { id: g._id.toString(), kind: 'GUEST', name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0, results: [] });
            }
        });

        fixedTerms.forEach((term: any) => {
            const uniqueTermAttendees = getUniqueAttendees(term.attendees);
            const termAttendeeKeys = new Set(uniqueTermAttendees.map((att: any) => {
                const id = typeof att.id === 'object' && att.id !== null ? (att.id._id ?? att.id).toString() : att.id;
                return `${att.kind}-${id}`;
            }));

            uniqueTermAttendees.forEach((att: any) => {
                const id = typeof att.id === 'object' && att.id !== null ? (att.id._id ?? att.id).toString() : att.id;
                const key = `${att.kind}-${id}`;
                if (!statsMap.has(key)) {
                    let name = 'Unknown';
                    if (att.kind === 'USER' && typeof att.id === 'object' && att.id !== null) {
                        const u = att.id;
                        name = u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                    } else if (att.kind === 'GUEST') {
                        const guest = (event.guests as any[]).find((g: any) => g._id.toString() === id);
                        if (guest) name = `${guest.firstName} ${guest.lastName}`;
                    }
                    statsMap.set(key, { id, kind: att.kind, name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0, results: [] });
                }
                statsMap.get(key)!.attendance += 1;
            });

            if (term.statistics?.teams?.length > 0) {
                const teamsWithStats = term.statistics.teams.map((t: any) => ({
                    ...t,
                    w: t.wins || 0, d: t.draws || 0, l: t.losses || 0,
                    played: (t.wins || 0) + (t.draws || 0) + (t.losses || 0)
                })).filter((t: any) => t.played > 0);

                if (teamsWithStats.length > 0) {
                    const sortedTeams = [...teamsWithStats].sort((a: any, b: any) => {
                        if (b.w !== a.w) return b.w - a.w;
                        if (b.d !== a.d) return b.d - a.d;
                        return a.l - b.l;
                    });
                    const best = sortedTeams[0];
                    const topTeams = sortedTeams.filter((t: any) => t.w === best.w && t.d === best.d && t.l === best.l);
                    const singleWinner = topTeams.length === 1;

                    teamsWithStats.forEach((team: any) => {
                        const isTop = topTeams.some((tt: any) => tt.name === team.name);
                        const outcome = isTop ? (singleWinner ? 'WIN' : 'DRAW') : 'LOSS';
                        team.members.forEach((member: any) => {
                            const key = `${member.kind}-${member.id}`;
                            const stats = statsMap.get(key);
                            if (stats && termAttendeeKeys.has(key)) {
                                if (outcome === 'WIN') stats.wins += 1;
                                else if (outcome === 'DRAW') stats.draws += 1;
                                else stats.losses += 1;
                                stats.totalGames += 1;
                                stats.results.push(outcome);
                            }
                        });
                    });
                }
            }
        });

        const stats = Array.from(statsMap.values()).map(({ results, ...s }) => ({
            ...s,
            attendancePct: totalTerms > 0 ? (s.attendance / totalTerms) * 100 : 0,
            winPct: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
            lossPct: s.totalGames > 0 ? (s.losses / s.totalGames) * 100 : 0,
            ...computeStreaks(results)
        }));

        res.json({ totalTerms, filledTermsCount, stats });
    } catch (error: any) {
        logger.error('Error computing event stats', { error: error.message, uuid: req.params.uuid });
        res.status(500).json({ message: error.message });
    }
};
