import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createPoll,
  getMyPolls,
  getPollByUuid,
  addResponse,
  deleteResponse,
  closePoll,
  confirmPoll,
  deletePoll,
  updatePoll,
} from '../controllers/pollController';

const router = express.Router();

router.post('/', protect, createPoll);
router.get('/', protect, getMyPolls);
router.get('/:uuid', getPollByUuid);
router.post('/:uuid/responses', addResponse);
router.patch('/:uuid/close', protect, closePoll);
router.post('/:uuid/confirm', protect, confirmPoll);
router.put('/:uuid', protect, updatePoll);
router.delete('/:uuid/responses/:name', protect, deleteResponse);
router.delete('/:uuid', protect, deletePoll);

export default router;
