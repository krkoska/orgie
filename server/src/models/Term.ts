import mongoose, { Document } from 'mongoose';

export interface ITeamResult {
    name: string;
    members: { id: mongoose.Types.ObjectId, kind: 'USER' | 'GUEST' }[];
    wins: number;
    draws: number;
    losses: number;
}

export interface IStatistics {
    teams: ITeamResult[];
}

export interface ITerm extends Document {
    eventId: mongoose.Types.ObjectId;
    date: Date;
    startTime: string;
    endTime: string;
    attendees: { id: mongoose.Types.ObjectId, kind: 'USER' | 'GUEST' }[];
    statistics?: IStatistics;
}

const termSchema = new mongoose.Schema({
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    attendees: [{
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        kind: { type: String, enum: ['USER', 'GUEST'], required: true }
    }],
    statistics: {
        teams: [{
            name: { type: String, required: true },
            members: [{
                id: { type: mongoose.Schema.Types.ObjectId, required: true },
                kind: { type: String, enum: ['USER', 'GUEST'], required: true }
            }],
            wins: { type: Number, default: 0 },
            draws: { type: Number, default: 0 },
            losses: { type: Number, default: 0 }
        }]
    }
});

// Compound index for quick lookup of terms by event and date
termSchema.index({ eventId: 1, date: 1 });

export default mongoose.model<ITerm>('Term', termSchema);
