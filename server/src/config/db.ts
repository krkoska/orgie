import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/sports-organizer';

        // Options often needed for Azure Cosmos DB
        const options = {
            // retryWrites: false, // Often required for Cosmos DB RU clusters
        };

        const conn = await mongoose.connect(uri, options);
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        logger.error(`Database connection error: ${error.message}`);
        throw error;
    }
};

export default connectDB;
