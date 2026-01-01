import { Request, Response } from 'express';
import User from '../models/User';
import logger from '../utils/logger';
import { updateProfileSchema } from '../utils/validation';

export const searchUsers = async (req: Request, res: Response) => {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
            return res.json([]);
        }

        const keyword = q ? {
            $or: [
                { firstName: { $regex: q, $options: 'i' } },
                { lastName: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ]
        } : {};

        const users = await User.find(keyword)
            .select('firstName lastName email _id') // Do not select password
            .limit(10);

        res.json(users);
    } catch (error: any) {
        logger.error('Error searching users', { error: error.message, query: req.query.q });
        res.status(500).json({ message: error.message });
    }
};

export const updateUserProfile = async (req: Request, res: Response) => {
    try {
        const validatedData = updateProfileSchema.parse(req.body);
        const user = await User.findById((req as any).user._id);

        if (user) {
            user.firstName = validatedData.firstName || user.firstName;
            user.lastName = validatedData.lastName || user.lastName;

            if (validatedData.password) {
                user.passwordHash = validatedData.password;
            }

            const updatedUser = await user.save();
            logger.info('User profile updated', { userId: user._id, email: user.email });

            res.json({
                _id: updatedUser._id,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName,
                email: updatedUser.email,
                role: updatedUser.role
            });
        } else {
            logger.warn('User not found during profile update', { userId: (req as any).user._id });
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ message: error.errors[0].message });
        }
        logger.error('Error updating profile', { error: error.message, userId: (req as any).user._id });
        res.status(500).json({ message: error.message });
    }
};
