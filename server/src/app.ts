import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes';
import eventRoutes from './routes/eventRoutes';
import userRoutes from './routes/userRoutes';
import logger from './utils/logger';

const app = express();

const isProduction = process.env.NODE_ENV === 'production';

// Security configuration
app.use(cors({
    origin: true, // In production, replace with specific domain
    credentials: true
}));
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cookieParser());
app.use(express.json());

// Use morgan for request logging, pipe to our logger
app.use(morgan(isProduction ? 'combined' : 'dev', {
    stream: { write: (message) => logger.info(message.trim()) }
}));

// Rate limiting for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes' }
});

app.use('/api/auth', authLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/users', userRoutes);


// Serve static assets in production
if (isProduction) {
    const buildPath = path.join(__dirname, '../../client/dist');
    app.use(express.static(buildPath));

    app.get(/.*/, (req, res) => {
        res.sendFile(path.resolve(buildPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('API is running in development mode');
    });
}

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled Exception', {
        error: err.message,
        stack: isProduction ? undefined : err.stack,
        url: req.originalUrl,
        method: req.method
    });

    res.status(err.status || 500).json({
        message: isProduction ? 'An unexpected error occurred' : err.message
    });
});

export default app;
