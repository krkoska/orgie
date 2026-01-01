import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import logger from '../utils/logger';

interface JwtPayload {
    id: string;
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
    let token = req.cookies.accessToken;

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;

            (req as any).user = await User.findById(decoded.id).select('-passwordHash');

            next();
        } catch (error: any) {
            logger.warn('Auth token validation failed', { error: error.message, url: req.originalUrl });
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        logger.warn('Auth attempt without token', { url: req.originalUrl, ip: req.ip });
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};
