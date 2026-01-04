import express from 'express';
import { createEvent, getEvents, getMyEvents, getDashboardEvents, deleteEvent, updateEvent, getEventByUuid, generateTerms, deleteTerm, toggleTermAttendance, toggleEventAttendance, getArchivedTerms, deleteArchivedTerms, removeAttendeeFromEvent, addGuestToEvent, updateTermStatistics } from '../controllers/eventController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', protect, createEvent);
router.get('/', getEvents);
router.get('/dashboard', protect, getDashboardEvents);
router.get('/my', protect, getMyEvents);
router.post('/terms', protect, generateTerms);
router.post('/terms/:termId/attendance', protect, toggleTermAttendance);
router.post('/terms/:id/statistics', protect, updateTermStatistics);
router.post('/:uuid/attendance', protect, toggleEventAttendance);
router.post('/uuid/:uuid/guests', protect, addGuestToEvent);
router.delete('/terms/:id', protect, deleteTerm);
router.get('/uuid/:uuid', getEventByUuid);
router.get('/uuid/:uuid/archived', getArchivedTerms);
router.delete('/uuid/:uuid/archived', protect, deleteArchivedTerms);
router.put('/:id', protect, updateEvent);
router.delete('/uuid/:uuid/attendees/:userId', protect, removeAttendeeFromEvent);
router.delete('/:id', protect, deleteEvent);

export default router;
