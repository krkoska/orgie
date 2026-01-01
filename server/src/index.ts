import dotenv from 'dotenv';
import app from './app';
import connectDB from './config/db';
import logger from './utils/logger';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    // Basic security check: exit if secrets are missing
    if (!process.env.JWT_SECRET || !process.env.REFRESH_TOKEN_SECRET) {
        logger.error('CRITICAL: JWT_SECRET or REFRESH_TOKEN_SECRET is missing! Exiting...');
        process.exit(1);
    }

    try {
        await connectDB();
        logger.info(`Server running on port ${PORT}`);
        app.listen(PORT);
    } catch (error: any) {
        logger.error('DB Connection Failed, but starting server anyway for testing purposes.', {
            error: error.message
        });
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT} (No DB)`);
        });
    }
};

startServer();
