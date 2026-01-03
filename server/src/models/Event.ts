import mongoose, { Document, Schema } from 'mongoose';

export enum EventType {
    ONE_TIME = 'ONE_TIME',
    RECURRING = 'RECURRING'
}

export enum RecurrenceFrequency {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY'
}

export interface IRecurrence {
    frequency: RecurrenceFrequency;
    weekDays?: number[]; // 0-6, where 0 is Sunday
    monthDays?: number[]; // 1-31
}

export interface IGuest {
    _id: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    addedBy: mongoose.Types.ObjectId;
}

export interface IAttendee {
    id: mongoose.Types.ObjectId;
    kind: 'USER' | 'GUEST';
}

export interface IEvent extends Document {
    name: string;
    place?: string;
    ownerId: mongoose.Schema.Types.ObjectId;
    type: EventType;
    startTime: string; // HH:mm
    endTime: string;   // HH:mm
    date?: Date;       // For ONE_TIME
    recurrence?: IRecurrence; // For RECURRING
    uuid: string;
    administrators: mongoose.Types.ObjectId[];
    attendees: IAttendee[];
    guests: IGuest[];
    minAttendees: number;
    maxAttendees: number;
    createdAt: Date;
    updatedAt: Date;
}

const EventSchema: Schema = new Schema({
    name: {
        type: String,
        required: [true, 'Please add an event name'],
        maxlength: [50, 'Name can not be more than 50 characters']
    },
    place: {
        type: String,
        maxlength: [50, 'Place can not be more than 50 characters']
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: Object.values(EventType),
        required: true,
        default: EventType.ONE_TIME
    },
    startTime: {
        type: String,
        required: [true, 'Please add a start time (HH:mm)'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please add a valid time in HH:mm format']
    },
    endTime: {
        type: String,
        required: [true, 'Please add an end time (HH:mm)'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please add a valid time in HH:mm format']
    },
    date: {
        type: Date
    },
    recurrence: {
        frequency: {
            type: String,
            enum: Object.values(RecurrenceFrequency)
        },
        weekDays: [{ type: Number, min: 0, max: 6 }],
        monthDays: [Number]
    },
    uuid: {
        type: String,
        required: true,
        unique: true
    },
    administrators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    attendees: [{
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        kind: { type: String, enum: ['USER', 'GUEST'], required: true }
    }],
    guests: [{
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
    }],
    minAttendees: { type: Number, default: 0, min: 0 },
    maxAttendees: { type: Number, default: 0, min: 0 }
}, {
    timestamps: true
});

export default mongoose.model<IEvent>('Event', EventSchema);
