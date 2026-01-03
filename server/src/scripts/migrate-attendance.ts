import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Force load env from server directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgie';

async function migrate() {
    console.log('Starting attendance data migration...');
    console.log('Target database:', MONGODB_URI.split('@').pop()); // Log only the host for security

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) throw new Error('Database connection failed - db is undefined');
        const eventsColl = db.collection('events');
        const termsColl = db.collection('terms');

        // 1. Migrate Events
        const events = await eventsColl.find({}).toArray();
        console.log(`Found ${events.length} events.`);

        let eventsUpdated = 0;
        for (const event of events) {
            if (Array.isArray(event.attendees)) {
                let modified = false;
                const newAttendees = event.attendees.map((a: any) => {
                    // Check if attendee is already in the new { id, kind } format
                    if (a && typeof a === 'object' && a.id && a.kind) {
                        return a;
                    }
                    // If it's just an ID (ObjectId or string), wrap it
                    modified = true;
                    return { id: a, kind: 'USER' };
                });

                if (modified) {
                    await eventsColl.updateOne({ _id: event._id }, { $set: { attendees: newAttendees } });
                    eventsUpdated++;
                }
            }
        }
        console.log(`Successfully updated structure for ${eventsUpdated} events.`);

        // 2. Migrate Terms
        const terms = await termsColl.find({}).toArray();
        console.log(`Found ${terms.length} terms.`);

        let termsUpdated = 0;
        for (const term of terms) {
            if (Array.isArray(term.attendees)) {
                let modified = false;
                const newAttendees = term.attendees.map((a: any) => {
                    if (a && typeof a === 'object' && a.id && a.kind) {
                        return a;
                    }
                    modified = true;
                    return { id: a, kind: 'USER' };
                });

                if (modified) {
                    await termsColl.updateOne({ _id: term._id }, { $set: { attendees: newAttendees } });
                    termsUpdated++;
                }
            }
        }
        console.log(`Successfully updated structure for ${termsUpdated} terms.`);

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
