// Migration script to add UUIDs to existing events
// Run with: npx ts-node src/utils/migrateEventUuids.ts

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import Event from '../models/Event';
import dotenv from 'dotenv';

dotenv.config();

const migrateEventUuids = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/event-manager');
        console.log('Connected to MongoDB');

        // Find all events without UUID
        const eventsWithoutUuid = await Event.find({
            $or: [
                { uuid: { $exists: false } },
                { uuid: null },
                { uuid: '' }
            ]
        });

        console.log(`Found ${eventsWithoutUuid.length} events without UUID`);

        let updated = 0;
        for (const event of eventsWithoutUuid) {
            event.uuid = uuidv4();
            await event.save();
            updated++;
            console.log(`Updated event: ${event.name} (${event._id}) with UUID: ${event.uuid}`);
        }

        console.log(`\nMigration complete! Updated ${updated} events.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrateEventUuids();
