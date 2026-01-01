import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import logger from '../utils/logger';
import { registerSchema, loginSchema } from '../utils/validation';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const generateTokens = (id: string) => {
    const accessToken = jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
        expiresIn: ACCESS_TOKEN_EXPIRY
    });
    const refreshToken = jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret', {
        expiresIn: REFRESH_TOKEN_EXPIRY
    });
    return { accessToken, refreshToken };
};

const setTokenCookies = (res: Response, accessToken: string, refreshToken: string) => {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000 // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE
    });
};

export const registerUser = async (req: Request, res: Response) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const { email, password, firstName, lastName } = validatedData;

        const userExists = await User.findOne({ email });

        if (userExists) {
            logger.warn('Registration attempt with existing email', { email });
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            email,
            passwordHash: password,
            firstName,
            lastName
        });

        if (user) {
            const { accessToken, refreshToken } = generateTokens(user._id.toString());
            user.refreshToken = refreshToken; // Store for revocation
            await user.save();

            setTokenCookies(res, accessToken, refreshToken);
            logger.info('User registered successfully', { userId: user._id, email: user.email });

            res.status(201).json({
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role
            });
        }
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ message: error.errors[0].message });
        }
        logger.error('Registration error', { error: error.message, email: req.body.email });
        res.status(500).json({ message: error.message });
    }
};

export const loginUser = async (req: Request, res: Response) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const { email, password } = validatedData;

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            const { accessToken, refreshToken } = generateTokens(user._id.toString());
            user.refreshToken = refreshToken;
            await user.save();

            setTokenCookies(res, accessToken, refreshToken);
            logger.info('User logged in successfully', { userId: user._id, email: user.email });

            res.json({
                _id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role
            });
        } else {
            logger.warn('Failed login attempt', { email });
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error: any) {
        if (error.name === 'ZodError') {
            return res.status(400).json({ message: error.errors[0].message });
        }
        logger.error('Login error', { error: error.message, email: req.body.email });
        res.status(500).json({ message: error.message });
    }
};

export const refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ message: 'Not authorized, no refresh token' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || 'refresh_secret') as { id: string };
        const user = await User.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken) {
            return res.status(401).json({ message: 'Not authorized, token revoked' });
        }

        const tokens = generateTokens(user._id.toString());
        user.refreshToken = tokens.refreshToken;
        await user.save();

        setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
        res.json({ status: 'success' });
    } catch (error) {
        res.status(401).json({ message: 'Not authorized, refresh token failed' });
    }
};

export const logoutUser = async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
        await User.findOneAndUpdate({ refreshToken }, { refreshToken: null });
    }
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (user) {
        res.json({
            _id: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
};

