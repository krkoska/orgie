// server/src/models/Poll.ts
import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

export enum PollStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum VoteAnswer {
  YES = 'YES',
  MAYBE = 'MAYBE',
  NO = 'NO',
}

export enum PollType {
  DATE = 'DATE',
  TEXT = 'TEXT',
}

export interface IPollVote {
  dateIndex: number;
  answer: VoteAnswer;
}

export interface IPollResponse {
  name: string;
  userId?: mongoose.Types.ObjectId;
  votes: IPollVote[];
}

export interface IPoll extends Document {
  uuid: string;
  title: string;
  description?: string;
  createdBy: mongoose.Types.ObjectId;
  proposedDates: Date[];
  responses: IPollResponse[];
  deadline?: Date;
  status: PollStatus;
  winnerDateIndex?: number;
  resultEventId?: mongoose.Types.ObjectId;
  resultEventUuid?: string;
  pollType: PollType;
  proposedOptions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const PollVoteSchema = new Schema<IPollVote>(
  {
    dateIndex: { type: Number, required: true },
    answer: { type: String, enum: Object.values(VoteAnswer), required: true },
  },
  { _id: false }
);

const PollResponseSchema = new Schema<IPollResponse>(
  {
    name: { type: String, required: true, maxlength: 100 },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    votes: [PollVoteSchema],
  },
  { _id: false }
);

const PollSchema = new Schema<IPoll>(
  {
    uuid: { type: String, default: () => uuidv4(), unique: true },
    title: { type: String, required: true, maxlength: 50 },
    description: { type: String, maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    proposedDates: [{ type: Date, required: true }],
    responses: [PollResponseSchema],
    deadline: { type: Date },
    status: { type: String, enum: Object.values(PollStatus), default: PollStatus.OPEN },
    winnerDateIndex: { type: Number },
    resultEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
    resultEventUuid: { type: String },
    pollType: { type: String, enum: Object.values(PollType), default: PollType.DATE },
    proposedOptions: [{ type: String, maxlength: 100 }],
  },
  { timestamps: true }
);

export default mongoose.model<IPoll>('Poll', PollSchema);
