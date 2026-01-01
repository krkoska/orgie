import express from 'express';
import { createEvent, getEvents, getMyEvents, getDashboardEvents, deleteEvent, updateEvent, getEventByUuid, generateTerms, deleteTerm, toggleTermAttendance, toggleEventAttendance, getArchivedTerms, deleteArchivedTerms } from '../controllers/eventController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.post('/', protect, createEvent);
router.get('/', getEvents);
router.get('/dashboard', protect, getDashboardEvents);
router.get('/my', protect, getMyEvents);
router.post('/terms', protect, generateTerms);
router.post('/terms/:termId/attendance', protect, toggleTermAttendance);
router.post('/:uuid/attendance', protect, toggleEventAttendance);
router.delete('/terms/:id', protect, deleteTerm);
router.get('/uuid/:uuid', getEventByUuid);
router.get('/uuid/:uuid/archived', getArchivedTerms);
router.delete('/uuid/:uuid/archived', protect, deleteArchivedTerms);
router.put('/:id', protect, updateEvent);
router.delete('/:id', protect, deleteEvent);

export default router;
