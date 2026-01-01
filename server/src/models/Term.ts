import mongoose, { Document } from 'mongoose';

export interface ITerm extends Document {
    eventId: mongoose.Types.ObjectId;
    date: Date;
    startTime: string;
    endTime: string;
    attendees: mongoose.Types.ObjectId[];
}

const termSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

// Compound index for quick lookup of terms by event and date
termSchema.index({ eventId: 1, date: 1 });

export default mongoose.model<ITerm>('Term', termSchema);
