# Hledání termínu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scheduling-poll feature ("hledání termínu") where an organizer proposes candidate dates, anyone with a public link votes Yes/Maybe/No, and the organizer confirms the winner to create a ONE_TIME Event.

**Architecture:** New standalone `Poll` MongoDB model with its own controller and routes under `/api/polls`. The dashboard gains tabs (Události / Hlasování). Two new client pages: poll creation (private) and a public voting/results page.

**Tech Stack:** Node.js + Express + Mongoose (server); React 19 + TypeScript + React Router 7 + Axios (client); existing `uuid` package for public links; existing `protect` middleware for auth.

---

## File Map

**Create:**
- `server/src/models/Poll.ts` — Poll Mongoose model + TypeScript interfaces
- `server/src/controllers/pollController.ts` — all 7 endpoint handlers
- `server/src/routes/pollRoutes.ts` — route definitions
- `client/src/pages/PollCreatePage.tsx` — poll creation form (private)
- `client/src/pages/PollPage.tsx` — public voting + organizer management page

**Modify:**
- `server/src/app.ts` — register `/api/polls` routes
- `client/src/App.tsx` — add `/poll/create` and `/poll/:uuid` routes
- `client/src/pages/Dashboard.tsx` — add tab switcher + poll list
- `client/src/context/LanguageContext.tsx` — add poll translation keys

---

## Task 1: Poll Model

**Files:**
- Create: `server/src/models/Poll.ts`

- [ ] **Step 1: Create the Poll model**

```typescript
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
    uuid: { type: String, default: uuidv4, unique: true },
    title: { type: String, required: true, maxlength: 50 },
    description: { type: String, maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    proposedDates: [{ type: Date, required: true }],
    responses: [PollResponseSchema],
    deadline: { type: Date },
    status: { type: String, enum: Object.values(PollStatus), default: PollStatus.OPEN },
    winnerDateIndex: { type: Number },
    resultEventId: { type: Schema.Types.ObjectId, ref: 'Event' },
  },
  { timestamps: true }
);

export default mongoose.model<IPoll>('Poll', PollSchema);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/src/models/Poll.ts
git commit -m "feat: add Poll model"
```

---

## Task 2: Poll Controller

**Files:**
- Create: `server/src/controllers/pollController.ts`

- [ ] **Step 1: Create the controller**

```typescript
// server/src/controllers/pollController.ts
import { Request, Response } from 'express';
import Poll, { PollStatus, VoteAnswer, IPoll } from '../models/Poll';
import Event from '../models/Event';
import logger from '../utils/logger';

// Helper: compute winner index from poll responses
function computeWinnerIndex(poll: IPoll): number {
  const scores = poll.proposedDates.map((_, i) => {
    const yes = poll.responses.filter(r =>
      r.votes.some(v => v.dateIndex === i && v.answer === VoteAnswer.YES)
    ).length;
    const maybe = poll.responses.filter(r =>
      r.votes.some(v => v.dateIndex === i && v.answer === VoteAnswer.MAYBE)
    ).length;
    return { index: i, yes, yesMaybe: yes + maybe };
  });
  scores.sort((a, b) => {
    if (b.yes !== a.yes) return b.yes - a.yes;
    if (b.yesMaybe !== a.yesMaybe) return b.yesMaybe - a.yesMaybe;
    return a.index - b.index;
  });
  return scores[0].index;
}

// Helper: auto-close poll if deadline has passed
async function autoCloseIfExpired(poll: IPoll): Promise<IPoll> {
  if (poll.status === PollStatus.OPEN && poll.deadline && poll.deadline < new Date()) {
    poll.status = PollStatus.CLOSED;
    if (poll.proposedDates.length > 0) {
      poll.winnerDateIndex = computeWinnerIndex(poll);
    }
    await poll.save();
  }
  return poll;
}

// POST /api/polls — create poll (auth required)
export const createPoll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const { title, description, proposedDates, deadline } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }
    if (!Array.isArray(proposedDates) || proposedDates.length < 2) {
      res.status(400).json({ message: 'At least 2 proposed dates are required' });
      return;
    }

    const poll = await Poll.create({
      title: title.trim(),
      description: description?.trim(),
      createdBy: userId,
      proposedDates: proposedDates.map((d: string) => new Date(d)),
      deadline: deadline ? new Date(deadline) : undefined,
    });

    logger.info('Poll created', { pollId: poll._id, userId });
    res.status(201).json(poll);
  } catch (error) {
    logger.error('Error creating poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/polls — list my polls (auth required)
export const getMyPolls = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const polls = await Poll.find({ createdBy: userId }).sort({ createdAt: -1 });
    res.json(polls);
  } catch (error) {
    logger.error('Error fetching polls', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/polls/:uuid — get poll by uuid (public)
export const getPollByUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    let poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    poll = await autoCloseIfExpired(poll);
    res.json(poll);
  } catch (error) {
    logger.error('Error fetching poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/polls/:uuid/responses — add or update vote (public)
export const addResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    let poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    poll = await autoCloseIfExpired(poll);
    if (poll.status === PollStatus.CLOSED) {
      res.status(400).json({ message: 'This poll is closed' });
      return;
    }

    const { name, userId, votes } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }
    if (!Array.isArray(votes) || votes.length === 0) {
      res.status(400).json({ message: 'Votes are required' });
      return;
    }

    // Remove existing response for this voter (by userId or name)
    poll.responses = poll.responses.filter(r => {
      if (userId && r.userId?.toString() === userId.toString()) return false;
      if (!userId && r.name.toLowerCase() === name.trim().toLowerCase()) return false;
      return true;
    });

    poll.responses.push({
      name: name.trim(),
      userId: userId || undefined,
      votes,
    });

    await poll.save();
    logger.info('Poll response added', { pollId: poll._id, name });
    res.json(poll);
  } catch (error) {
    logger.error('Error adding poll response', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// PATCH /api/polls/:uuid/close — manually close poll (auth required, owner only)
export const closePoll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    if (poll.createdBy.toString() !== userId.toString()) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    if (poll.status === PollStatus.CLOSED) {
      res.status(400).json({ message: 'Poll is already closed' });
      return;
    }

    poll.status = PollStatus.CLOSED;
    poll.winnerDateIndex = poll.proposedDates.length > 0 ? computeWinnerIndex(poll) : undefined;
    await poll.save();

    logger.info('Poll closed', { pollId: poll._id, winnerDateIndex: poll.winnerDateIndex });
    res.json(poll);
  } catch (error) {
    logger.error('Error closing poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/polls/:uuid/confirm — confirm winner and create Event (auth required, owner only)
export const confirmPoll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    if (poll.createdBy.toString() !== userId.toString()) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    if (poll.status !== PollStatus.CLOSED) {
      res.status(400).json({ message: 'Poll must be closed before confirming' });
      return;
    }
    if (poll.winnerDateIndex === undefined || poll.winnerDateIndex === null) {
      res.status(400).json({ message: 'No winner determined' });
      return;
    }
    if (poll.resultEventId) {
      res.status(400).json({ message: 'Event already created for this poll' });
      return;
    }

    const { place, endTime } = req.body;
    if (!place || typeof place !== 'string' || place.trim().length === 0) {
      res.status(400).json({ message: 'Place is required' });
      return;
    }
    if (!endTime || typeof endTime !== 'string') {
      res.status(400).json({ message: 'End time is required' });
      return;
    }

    const winnerDate = poll.proposedDates[poll.winnerDateIndex];
    const startTime = winnerDate.toTimeString().slice(0, 5); // "HH:MM"

    const event = await Event.create({
      name: poll.title,
      place: place.trim(),
      ownerId: userId,
      type: 'ONE_TIME',
      startTime,
      endTime,
      date: winnerDate,
      administrators: [],
      attendees: [],
      minAttendees: 0,
      maxAttendees: 100,
    });

    poll.resultEventId = event._id as mongoose.Types.ObjectId;
    await poll.save();

    logger.info('Event created from poll', { pollId: poll._id, eventId: event._id });
    res.status(201).json({ poll, event });
  } catch (error) {
    logger.error('Error confirming poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/polls/:uuid — delete poll (auth required, owner only)
export const deletePoll = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    if (poll.createdBy.toString() !== userId.toString()) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    await poll.deleteOne();
    logger.info('Poll deleted', { pollId: poll._id, userId });
    res.json({ message: 'Poll deleted' });
  } catch (error) {
    logger.error('Error deleting poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};
```

Note: Add `import mongoose from 'mongoose';` at top (needed for the cast in confirmPoll). The full import block:
```typescript
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Poll, { PollStatus, VoteAnswer, IPoll } from '../models/Poll';
import Event from '../models/Event';
import logger from '../utils/logger';
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/pollController.ts
git commit -m "feat: add Poll controller"
```

---

## Task 3: Poll Routes + Register in App

**Files:**
- Create: `server/src/routes/pollRoutes.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create poll routes**

```typescript
// server/src/routes/pollRoutes.ts
import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  createPoll,
  getMyPolls,
  getPollByUuid,
  addResponse,
  closePoll,
  confirmPoll,
  deletePoll,
} from '../controllers/pollController';

const router = express.Router();

router.post('/', protect, createPoll);
router.get('/', protect, getMyPolls);
router.get('/:uuid', getPollByUuid);
router.post('/:uuid/responses', addResponse);
router.patch('/:uuid/close', protect, closePoll);
router.post('/:uuid/confirm', protect, confirmPoll);
router.delete('/:uuid', protect, deletePoll);

export default router;
```

- [ ] **Step 2: Register routes in app.ts**

Open `server/src/app.ts`. Find the block where event/auth/user routes are registered (look for `app.use('/api/events', ...)`). Add the poll routes directly after:

```typescript
import pollRoutes from './routes/pollRoutes';
// ...
app.use('/api/polls', pollRoutes);
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Manual smoke test**

Start server:
```bash
cd /Users/koudelka/Koudelka/orgie && docker-compose up -d && npm run dev
```

Test the public endpoint returns 404 for unknown uuid:
```bash
curl http://localhost:5001/api/polls/nonexistent-uuid
```
Expected: `{"message":"Poll not found"}`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/pollRoutes.ts server/src/app.ts
git commit -m "feat: add Poll routes and register in app"
```

---

## Task 4: Add Translation Keys

**Files:**
- Modify: `client/src/context/LanguageContext.tsx`

- [ ] **Step 1: Add poll translation keys**

Open `client/src/context/LanguageContext.tsx`. Find the `translations` object and add these keys alongside the existing ones:

```typescript
// Poll feature
polls: { en: 'Polls', cs: 'Hlasování' },
events: { en: 'Events', cs: 'Události' },
newPoll: { en: 'New Poll', cs: 'Nové hlasování' },
pollTitle: { en: 'Poll title', cs: 'Název hlasování' },
pollDescription: { en: 'Description (optional)', cs: 'Popis (volitelný)' },
pollProposedDates: { en: 'Proposed dates', cs: 'Navržené termíny' },
pollDeadline: { en: 'Deadline (optional)', cs: 'Uzávěrka (volitelná)' },
pollAddDate: { en: '+ Add date', cs: '+ Přidat termín' },
pollCreateBtn: { en: 'Create poll', cs: 'Vytvořit hlasování' },
pollOpen: { en: 'Open', cs: 'Otevřeno' },
pollClosed: { en: 'Closed', cs: 'Uzavřeno' },
pollResponses: { en: 'responses', cs: 'hlasů' },
pollVoterName: { en: 'Your name', cs: 'Tvoje jméno' },
pollSaveVotes: { en: 'Save votes', cs: 'Uložit hlasy' },
pollClose: { en: 'Close poll', cs: 'Uzavřít hlasování' },
pollWinner: { en: 'Winning date', cs: 'Vítězný termín' },
pollCreateEvent: { en: 'Create event from this date', cs: 'Vytvořit event z tohoto termínu' },
pollPlace: { en: 'Place', cs: 'Místo' },
pollEndTime: { en: 'End time', cs: 'Čas konce' },
pollConfirmBtn: { en: 'Confirm and create event', cs: 'Potvrdit a vytvořit event' },
pollEventCreated: { en: 'Event created', cs: 'Event vytvořen' },
pollViewEvent: { en: 'View event', cs: 'Zobrazit event' },
pollCopyLink: { en: 'Copy link', cs: 'Kopírovat odkaz' },
pollLinkCopied: { en: 'Link copied!', cs: 'Odkaz zkopírován!' },
pollNoPolls: { en: 'You have no polls yet.', cs: 'Zatím nemáte žádná hlasování.' },
pollClosedVoting: { en: 'This poll is closed. Voting is no longer available.', cs: 'Toto hlasování je uzavřeno. Hlasování již není možné.' },
pollAtLeastTwoDates: { en: 'Add at least 2 dates', cs: 'Přidejte alespoň 2 termíny' },
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/context/LanguageContext.tsx
git commit -m "feat: add poll translation keys"
```

---

## Task 5: Dashboard Tabs

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add tab state and poll fetching**

At the top of the `Dashboard` component, after the existing state declarations, add:

```typescript
const [activeTab, setActiveTab] = useState<'events' | 'polls'>('events');
const [polls, setPolls] = useState<PollSummary[]>([]);
```

Add this interface near the top of the file (after the existing `Event` interface):

```typescript
interface PollSummary {
  _id: string;
  uuid: string;
  title: string;
  status: 'OPEN' | 'CLOSED';
  responses: unknown[];
  proposedDates: string[];
  winnerDateIndex?: number;
  resultEventId?: string;
  deadline?: string;
  createdAt: string;
}
```

Add a `fetchPolls` function alongside `fetchEvents`:

```typescript
const fetchPolls = async () => {
  try {
    const { data } = await api.get('/polls');
    setPolls(data || []);
  } catch (error) {
    console.error('Error fetching polls', error);
  }
};
```

Update `useEffect` to also call `fetchPolls`:

```typescript
useEffect(() => {
  fetchEvents();
  fetchPolls();
}, []);
```

- [ ] **Step 2: Add tab switcher UI and poll list rendering**

Replace the existing header `<div>` (the one with `display: 'flex', justifyContent: 'space-between'`) and the content below it. New render:

```tsx
return (
  <div className="dashboard">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
      <h1 style={{ margin: 0 }}>{t('dashboardTitle')}</h1>
      {activeTab === 'events' ? (
        <button className="btn-primary" onClick={() => setIsCreateModalOpen(true)}>
          + {t('createNewEvent')}
        </button>
      ) : (
        <button className="btn-primary" onClick={() => navigate('/poll/create')}>
          + {t('newPoll')}
        </button>
      )}
    </div>

    {/* Tab switcher */}
    <div style={{ display: 'flex', borderBottom: '2px solid #eee', marginBottom: '2rem' }}>
      {(['events', 'polls'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            padding: '8px 20px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontWeight: activeTab === tab ? 700 : 400,
            borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
            marginBottom: '-2px',
            color: activeTab === tab ? '#6366f1' : '#6b7280',
          }}
        >
          {tab === 'events' ? t('events') : t('polls')}
        </button>
      ))}
    </div>

    {loading ? (
      <p>{t('loading')}</p>
    ) : activeTab === 'events' ? (
      <>
        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
            {t('managedEvents') || 'Mnou spravované události'}
          </h2>
          {managedEvents.length === 0 ? (
            <p style={{ color: '#666' }}>{t('noManagedEvents') || 'Zatím nespravujete žádné události.'}</p>
          ) : (
            <div className="groups-grid">
              {managedEvents.map(event => renderEventCard(event, true))}
            </div>
          )}
        </section>
        <section>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '2px solid #eee', paddingBottom: '0.5rem' }}>
            {t('attendingEvents') || 'Události, kterých se účastním'}
          </h2>
          {attendingEvents.length === 0 ? (
            <p style={{ color: '#666' }}>{t('noAttendingEvents') || 'Zatím nejste přihlášeni k žádné události.'}</p>
          ) : (
            <div className="groups-grid">
              {attendingEvents.map(event => renderEventCard(event, false))}
            </div>
          )}
        </section>
      </>
    ) : (
      <section>
        {polls.length === 0 ? (
          <p style={{ color: '#666' }}>{t('pollNoPolls')}</p>
        ) : (
          <div className="groups-grid">
            {polls.map(poll => (
              <div key={poll._id} className="group-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0 }}>{poll.title}</h4>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{
                      background: poll.status === 'OPEN' ? '#fef3c7' : '#d1fae5',
                      color: poll.status === 'OPEN' ? '#92400e' : '#065f46',
                      padding: '2px 8px', borderRadius: '9999px', fontSize: '12px'
                    }}>
                      {poll.status === 'OPEN' ? t('pollOpen') : t('pollClosed')}
                    </span>
                    <Link to={`/poll/${poll.uuid}`} className="icon-btn" title="Detail">
                      <ExternalLink size={18} />
                    </Link>
                  </div>
                </div>
                <p style={{ margin: '5px 0', color: '#666', fontSize: '14px' }}>
                  {poll.responses.length} {t('pollResponses')} · {poll.proposedDates.length} termínů
                </p>
                {poll.status === 'CLOSED' && poll.winnerDateIndex !== undefined && (
                  <p style={{ margin: '5px 0', color: '#059669', fontSize: '14px' }}>
                    🏆 {new Date(poll.proposedDates[poll.winnerDateIndex]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {poll.deadline && poll.status === 'OPEN' && (
                  <p style={{ margin: '5px 0', color: '#888', fontSize: '13px' }}>
                    Uzávěrka: {new Date(poll.deadline).toLocaleDateString('cs-CZ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    )}

    {/* Retain all existing modal JSX unchanged — the three Modal components:
        1. isCreateModalOpen (EventForm inside)
        2. isDeleteModalOpen (delete confirmation)
        Keep them exactly as they are in the original file. */}
  </div>
);
```

Add `useNavigate` import at the top: `import { Link, useNavigate } from 'react-router-dom';` and `const navigate = useNavigate();` inside the component.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat: add polls tab to dashboard"
```

---

## Task 6: Poll Creation Page

**Files:**
- Create: `client/src/pages/PollCreatePage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// client/src/pages/PollCreatePage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';

const PollCreatePage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposedDates, setProposedDates] = useState<string[]>(['', '']);
  const [deadline, setDeadline] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addDate = () => setProposedDates([...proposedDates, '']);

  const removeDate = (index: number) => {
    setProposedDates(proposedDates.filter((_, i) => i !== index));
  };

  const updateDate = (index: number, value: string) => {
    const updated = [...proposedDates];
    updated[index] = value;
    setProposedDates(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const filledDates = proposedDates.filter(d => d.trim() !== '');
    if (filledDates.length < 2) {
      setError(t('pollAtLeastTwoDates'));
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post('/polls', {
        title: title.trim(),
        description: description.trim() || undefined,
        proposedDates: filledDates,
        deadline: deadline || undefined,
      });
      navigate(`/poll/${data.uuid}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error creating poll');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem' }}>
      <h1 style={{ marginBottom: '2rem' }}>{t('newPoll')}</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('pollTitle')} *</label>
          <input
            className="form-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            maxLength={50}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('pollDescription')}</label>
          <textarea
            className="form-input"
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={200}
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>{t('pollProposedDates')} *</label>
          {proposedDates.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="datetime-local"
                className="form-input"
                value={d}
                onChange={e => updateDate(i, e.target.value)}
                style={{ flex: 1 }}
              />
              {proposedDates.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeDate(i)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18 }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addDate} className="btn-secondary" style={{ marginTop: 4 }}>
            {t('pollAddDate')}
          </button>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('pollDeadline')}</label>
          <input
            type="datetime-local"
            className="form-input"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? '...' : t('pollCreateBtn')}
        </button>
      </form>
    </div>
  );
};

export default PollCreatePage;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PollCreatePage.tsx
git commit -m "feat: add poll creation page"
```

---

## Task 7: Public Voting + Organizer Page

**Files:**
- Create: `client/src/pages/PollPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
// client/src/pages/PollPage.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

type VoteAnswer = 'YES' | 'MAYBE' | 'NO';

interface PollVote {
  dateIndex: number;
  answer: VoteAnswer;
}

interface PollResponse {
  name: string;
  userId?: string;
  votes: PollVote[];
}

interface Poll {
  _id: string;
  uuid: string;
  title: string;
  description?: string;
  createdBy: string;
  proposedDates: string[];
  responses: PollResponse[];
  deadline?: string;
  status: 'OPEN' | 'CLOSED';
  winnerDateIndex?: number;
  resultEventId?: string;
}

const ANSWERS: VoteAnswer[] = ['YES', 'MAYBE', 'NO'];
const ANSWER_LABELS: Record<VoteAnswer, string> = { YES: '✅ Ano', MAYBE: '🟡 Možná', NO: '❌ Ne' };

const PollPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [voterName, setVoterName] = useState('');
  const [myVotes, setMyVotes] = useState<Record<number, VoteAnswer>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Confirm-event form state
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [confirmPlace, setConfirmPlace] = useState('');
  const [confirmEndTime, setConfirmEndTime] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const fetchPoll = async () => {
    try {
      const { data } = await api.get(`/polls/${uuid}`);
      setPoll(data);
      // Pre-fill voter name if logged in
      if (user) {
        setVoterName(`${user.firstName || ''} ${user.lastName || ''}`.trim());
      }
      // Pre-fill my existing votes if any
      const existing = data.responses.find((r: PollResponse) =>
        user ? r.userId === user._id : false
      );
      if (existing) {
        const voteMap: Record<number, VoteAnswer> = {};
        existing.votes.forEach((v: PollVote) => { voteMap[v.dateIndex] = v.answer; });
        setMyVotes(voteMap);
      }
    } catch {
      // poll not found
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPoll(); }, [uuid]);

  const handleVoteChange = (dateIndex: number, answer: VoteAnswer) => {
    setMyVotes(prev => ({ ...prev, [dateIndex]: answer }));
  };

  const handleSubmitVotes = async () => {
    if (!voterName.trim()) return;
    setSubmitLoading(true);
    setSubmitError('');
    try {
      const votes = poll!.proposedDates.map((_, i) => ({
        dateIndex: i,
        answer: myVotes[i] || 'NO' as VoteAnswer,
      }));
      const { data } = await api.post(`/polls/${uuid}/responses`, {
        name: voterName.trim(),
        userId: user?._id,
        votes,
      });
      setPoll(data);
      setSubmitSuccess(true);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Error saving votes');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      const { data } = await api.patch(`/polls/${uuid}/close`);
      setPoll(data);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Error closing poll');
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const { data } = await api.post(`/polls/${uuid}/confirm`, {
        place: confirmPlace,
        endTime: confirmEndTime,
      });
      setPoll(data.poll);
      navigate(`/event/${data.event.uuid}`);
    } catch (err: any) {
      setConfirmError(err.response?.data?.message || 'Error creating event');
    } finally {
      setConfirmLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) return <div style={{ padding: '2rem' }}>{t('loading')}</div>;
  if (!poll) return <div style={{ padding: '2rem' }}>Poll not found.</div>;

  const isOwner = user && poll.createdBy === user._id;
  const isClosed = poll.status === 'CLOSED';

  // Count YES votes per date for summary row
  const yesCounts = poll.proposedDates.map((_, i) =>
    poll.responses.filter(r => r.votes.find(v => v.dateIndex === i && v.answer === 'YES')).length
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>{poll.title}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            background: isClosed ? '#d1fae5' : '#fef3c7',
            color: isClosed ? '#065f46' : '#92400e',
            padding: '3px 10px', borderRadius: '9999px', fontSize: 13,
          }}>
            {isClosed ? t('pollClosed') : t('pollOpen')}
          </span>
          <button onClick={copyLink} className="btn-secondary" style={{ fontSize: 13 }}>
            {linkCopied ? t('pollLinkCopied') : t('pollCopyLink')}
          </button>
        </div>
      </div>
      {poll.description && <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>{poll.description}</p>}
      {poll.deadline && !isClosed && (
        <p style={{ color: '#888', fontSize: 13, marginBottom: '1rem' }}>
          Uzávěrka: {new Date(poll.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Vote matrix */}
      <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px', color: '#6b7280', fontWeight: 500, minWidth: 120 }}></th>
              {poll.proposedDates.map((d, i) => (
                <th key={i} style={{
                  padding: '8px 12px', textAlign: 'center', fontWeight: 600,
                  color: isClosed && poll.winnerDateIndex === i ? '#059669' : '#374151',
                  background: isClosed && poll.winnerDateIndex === i ? '#ecfdf5' : 'transparent',
                }}>
                  {new Date(d).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })}
                  <div style={{ fontSize: 12, fontWeight: 400, color: '#6b7280' }}>
                    {new Date(d).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {isClosed && poll.winnerDateIndex === i && <div style={{ fontSize: 11, color: '#059669' }}>🏆</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {poll.responses.map((r, ri) => (
              <tr key={ri} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px', color: '#374151' }}>{r.name}</td>
                {poll.proposedDates.map((_, i) => {
                  const vote = r.votes.find(v => v.dateIndex === i);
                  const label = vote ? ANSWER_LABELS[vote.answer] : '—';
                  return <td key={i} style={{ padding: '8px', textAlign: 'center' }}>{label}</td>;
                })}
              </tr>
            ))}

            {/* My vote row (if open) */}
            {!isClosed && (
              <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f9fafb' }}>
                <td style={{ padding: '8px' }}>
                  <input
                    placeholder={t('pollVoterName')}
                    value={voterName}
                    onChange={e => setVoterName(e.target.value)}
                    style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: 13, width: '100%' }}
                  />
                </td>
                {poll.proposedDates.map((_, i) => (
                  <td key={i} style={{ padding: '4px 8px', textAlign: 'center' }}>
                    <select
                      value={myVotes[i] || 'NO'}
                      onChange={e => handleVoteChange(i, e.target.value as VoteAnswer)}
                      style={{ fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 4px' }}
                    >
                      {ANSWERS.map(a => <option key={a} value={a}>{ANSWER_LABELS[a]}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            )}

            {/* Summary row */}
            <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f3f4f6' }}>
              <td style={{ padding: '8px', fontSize: 12, color: '#6b7280' }}>✅ Ano</td>
              {yesCounts.map((c, i) => (
                <td key={i} style={{
                  padding: '8px', textAlign: 'center', fontWeight: 600,
                  color: isClosed && poll.winnerDateIndex === i ? '#059669' : c > 0 ? '#374151' : '#9ca3af'
                }}>
                  {c}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Submit votes */}
      {!isClosed && (
        <div style={{ marginBottom: '2rem' }}>
          {submitSuccess && <p style={{ color: '#059669', marginBottom: 8 }}>Hlasy uloženy!</p>}
          {submitError && <p style={{ color: '#ef4444', marginBottom: 8 }}>{submitError}</p>}
          <button
            className="btn-primary"
            onClick={handleSubmitVotes}
            disabled={submitLoading || !voterName.trim()}
          >
            {submitLoading ? '...' : t('pollSaveVotes')}
          </button>
        </div>
      )}

      {isClosed && <p style={{ color: '#6b7280', marginBottom: '2rem' }}>{t('pollClosedVoting')}</p>}

      {/* Organizer panel */}
      {isOwner && (
        <div style={{ borderTop: '2px solid #eee', paddingTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Správa hlasování</h3>

          {!isClosed && (
            <button className="btn-secondary" onClick={handleClose} style={{ marginBottom: '1rem' }}>
              {t('pollClose')}
            </button>
          )}

          {isClosed && poll.winnerDateIndex !== undefined && !poll.resultEventId && (
            <>
              <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, color: '#065f46' }}>
                  🏆 {t('pollWinner')}: {new Date(poll.proposedDates[poll.winnerDateIndex]).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>

              {!showConfirmForm ? (
                <button className="btn-primary" onClick={() => setShowConfirmForm(true)}>
                  {t('pollCreateEvent')}
                </button>
              ) : (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                  <h4 style={{ marginBottom: 12 }}>{t('pollCreateEvent')}</h4>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>{t('pollPlace')} *</label>
                    <input className="form-input" value={confirmPlace} onChange={e => setConfirmPlace(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', marginBottom: 4, fontSize: 13, fontWeight: 600 }}>{t('pollEndTime')} *</label>
                    <input type="time" className="form-input" value={confirmEndTime} onChange={e => setConfirmEndTime(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  {confirmError && <p style={{ color: '#ef4444', marginBottom: 8 }}>{confirmError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" onClick={handleConfirm} disabled={confirmLoading || !confirmPlace || !confirmEndTime}>
                      {confirmLoading ? '...' : t('pollConfirmBtn')}
                    </button>
                    <button className="btn-secondary" onClick={() => setShowConfirmForm(false)}>Zpět</button>
                  </div>
                </div>
              )}
            </>
          )}

          {poll.resultEventId && (
            <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: 16 }}>
              <div style={{ fontWeight: 600, color: '#1e40af', marginBottom: 8 }}>{t('pollEventCreated')}</div>
              <Link to={`/event/${poll.resultEventId}`} className="btn-primary">{t('pollViewEvent')}</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PollPage;
```

Note: The `Poll` interface above already uses `resultEventUuid` (a string UUID stored on the poll document), not `resultEventId`. Make sure the server-side model and controller match — see Task 7 Step 2.

- [ ] **Step 2: Update Poll model and controller to store resultEventUuid**

In `server/src/models/Poll.ts`, add to the `IPoll` interface and schema:
```typescript
// interface — add alongside resultEventId
resultEventUuid?: string;
// schema — add alongside resultEventId field
resultEventUuid: { type: String },
```

In `server/src/controllers/pollController.ts`, in `confirmPoll`, after creating the event update the save block:
```typescript
poll.resultEventId = event._id as mongoose.Types.ObjectId;
poll.resultEventUuid = (event as any).uuid as string;
await poll.save();
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npx tsc --noEmit
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit
```
Expected: no errors from either

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PollPage.tsx server/src/models/Poll.ts server/src/controllers/pollController.ts
git commit -m "feat: add poll voting and organizer page"
```

---

## Task 8: Wire Up Client Routes

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add imports and routes**

Open `client/src/App.tsx`. Add imports at the top:
```typescript
import PollCreatePage from './pages/PollCreatePage';
import PollPage from './pages/PollPage';
```

Inside the router, add two new routes alongside the existing ones:
```tsx
// Private route
<Route path="/poll/create" element={<PrivateRoute><PollCreatePage /></PrivateRoute>} />
// Public route (anyone with link)
<Route path="/poll/:uuid" element={<PollPage />} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Full end-to-end manual test**

Start the app:
```bash
cd /Users/koudelka/Koudelka/orgie && npm run dev
```

1. Log in → Dashboard → click "Hlasování" tab → should show "Zatím nemáte žádná hlasování."
2. Click "+ Nové hlasování" → should navigate to `/poll/create`
3. Fill form (title, 2+ dates) → submit → should redirect to `/poll/<uuid>`
4. Voting page: enter name, set votes, click "Uložit hlasy" → votes should appear in the matrix
5. Organizer panel: click "Uzavřít hlasování" → poll closes, winner highlighted
6. Click "Vytvořit event z tohoto termínu" → fill place + end time → confirm → redirects to new event detail
7. Back on Dashboard → "Hlasování" tab shows the closed poll with winner date

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire up poll routes in App"
```

---

## Task 9: Add .gitignore entry for brainstorm files

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .superpowers/ to .gitignore**

Open `.gitignore` at the project root. Add:
```
.superpowers/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers/ brainstorm files"
```
