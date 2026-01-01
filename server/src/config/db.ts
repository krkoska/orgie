import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/sports-organizer';

        // Scrub password from URI for logging
        const scrubbedUri = uri.replace(/\/\/.*:.*@/, '//****:****@');
        logger.info(`Connecting to MongoDB at: ${scrubbedUri}`);

        // Options often needed for Azure Cosmos DB
        const options = {
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
        };

        const conn = await mongoose.connect(uri, options);
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        logger.error(`Database connection error: ${error.message}`);
        throw error;
    }
};

export default connectDB;
