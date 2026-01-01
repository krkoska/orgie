import express from 'express';
import { searchUsers, updateUserProfile } from '../controllers/userController';
import { protect } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/search', protect, searchUsers);
router.put('/profile', protect, updateUserProfile);

export default router;
