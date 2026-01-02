import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Event, { EventType } from '../models/Event';
import Term from '../models/Term';
import logger from '../utils/logger';

export const createEvent = async (req: Request, res: Response) => {
    try {
        const { name, place, type, startTime, endTime, date, recurrence, administrators, minAttendees, maxAttendees } = req.body;
        const ownerId = (req as any).user._id;

        // Custom validation
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
            administrators: administratorsList,
            minAttendees: minAttendees || 0,
            maxAttendees: maxAttendees || 0,
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
        const events = await Event.find().populate('ownerId', 'firstName lastName email');
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
        }).populate('ownerId', 'firstName lastName email')
            .populate('administrators', 'firstName lastName email');

        // Attending: user is in attendees of any Term related to the Event OR in Event.attendees
        const attendingTerms = await Term.find({ attendees: userId }).select('eventId');
        const eventIdsFromTerms = attendingTerms.map(t => t.eventId);

        const attending = await Event.find({
            $or: [
                { _id: { $in: eventIdsFromTerms } },
                { attendees: userId }
            ]
        }).populate('ownerId', 'firstName lastName email')
            .populate('administrators', 'firstName lastName email');

        res.json({ managed, attending });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getMyEvents = async (req: Request, res: Response) => {
    try {
        const ownerId = (req as any).user._id;
        const events = await Event.find({ ownerId })
            .populate('ownerId', 'firstName lastName email')
            .populate('administrators', 'firstName lastName email');
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
        const { name, place, type, startTime, endTime, date, recurrence, administrators, minAttendees, maxAttendees } = req.body;

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
        const event = await Event.findOne({ uuid: req.params.uuid })
            .populate('ownerId', 'firstName lastName email')
            .populate('administrators', 'firstName lastName email')
            .populate('attendees', 'firstName lastName email');

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Fetch active terms (today and future)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const terms = await Term.find({
            eventId: event._id,
            date: { $gte: today }
        })
            .sort({ date: 1 })
            .populate('attendees', 'firstName lastName email');

        res.json({ event, terms });
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

        if (event.type !== EventType.RECURRING || !event.recurrence || !event.recurrence.weekDays) {
            return res.status(400).json({ message: 'Event is not recurring or missing weekDays' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const termsToInsert = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            if (event.recurrence.weekDays.includes(d.getDay())) {
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

        const userId = (req as any).user._id;
        const userIdStr = userId.toString();

        // Check if user is already attending
        const attendeeIndex = term.attendees.findIndex(
            (attendeeId: any) => attendeeId.toString() === userIdStr
        );

        const isAttendingNow = attendeeIndex === -1;
        if (isAttendingNow) {
            // User is not attending - add them
            // Check if event has maxAttendees limit
            const event = await mongoose.model('Event').findById(term.eventId);
            if (event && event.maxAttendees && term.attendees.length >= event.maxAttendees) {
                return res.status(400).json({ message: 'Term is full' });
            }
            term.attendees.push(userId);
        } else {
            // User is attending - remove them
            term.attendees.splice(attendeeIndex, 1);
        }

        await term.save();

        // Populate attendees with user details for response
        const populatedTerm = await Term.findById(term._id).populate('attendees', 'firstName lastName email');
        logger.info('Term attendance toggled', { termId: term._id, userId: (req as any).user._id, attending: isAttendingNow });

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
        const userIdStr = user._id.toString();
        const index = event.attendees.findIndex((id: any) => id.toString() === userIdStr);

        if (index > -1) {
            event.attendees.splice(index, 1);
        } else {
            event.attendees.push(user._id);
        }

        await event.save();

        const updatedEvent = await Event.findById(event._id).populate('attendees', 'firstName lastName email');
        logger.info('Event attendance toggled', { eventId: event._id, userId: (req as any).user._id, attending: index === -1 });
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

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const archivedTerms = await Term.find({
            eventId: event._id,
            date: { $lt: today }
        })
            .sort({ date: -1 }) // Show most recent past terms first
            .populate('attendees', 'firstName lastName email');

        res.json(archivedTerms);
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
        const { uuid, userId } = req.params;
        const event = await Event.findOne({ uuid });

        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        const requesterId = (req as any).user._id.toString();
        const isAdmin = event.administrators.some(adminId => adminId && adminId.toString() === requesterId);
        const isOwner = event.ownerId && event.ownerId.toString() === requesterId;

        // Permission: Self-removal OR Admin/Owner removal
        if (requesterId !== userId && !isAdmin && !isOwner) {
            return res.status(401).json({ message: 'User not authorized to remove this attendee' });
        }

        // 1. Remove from Event.attendees
        event.attendees = (event.attendees as any[]).filter(id => id.toString() !== userId);
        await event.save();

        // 2. Remove from all Terms related to this Event
        await Term.updateMany(
            { eventId: event._id },
            { $pull: { attendees: userId } }
        );

        logger.info('Attendee removed from event and terms', { eventId: event._id, removedUserId: userId, requesterId });
        res.json({ message: 'Attendee removed successfully' });
    } catch (error: any) {
        logger.error('Error removing attendee', { error: error.message, eventUuid: req.params.uuid, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};
