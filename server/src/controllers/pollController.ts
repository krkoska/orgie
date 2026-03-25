import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Poll, { PollType, PollStatus, VoteAnswer, IPoll } from '../models/Poll';
import Event from '../models/Event';
import logger from '../utils/logger';

// Helper: compute winner index from poll responses
function computeWinnerIndex(poll: IPoll): number {
  const optionCount = poll.pollType === PollType.TEXT
    ? (poll.proposedOptions?.length || 0)
    : poll.proposedDates.length;

  const scores = Array.from({ length: optionCount }, (_, i) => {
    const yes = poll.responses.filter(r =>
      r.votes.find(v => v.dateIndex === i && v.answer === VoteAnswer.YES)
    ).length;
    const maybe = poll.responses.filter(r =>
      r.votes.find(v => v.dateIndex === i && v.answer === VoteAnswer.MAYBE)
    ).length;
    return { index: i, yes, total: yes + maybe };
  });

  if (scores.length === 0) return 0;

  scores.sort((a, b) =>
    b.yes !== a.yes ? b.yes - a.yes : b.total !== a.total ? b.total - a.total : a.index - b.index
  );
  return scores[0].index;
}

// Helper: auto-close poll if deadline has passed
async function autoCloseIfExpired(poll: IPoll | null): Promise<IPoll | null> {
  if (!poll) return null;
  if (poll.status === PollStatus.OPEN && poll.deadline && poll.deadline < new Date()) {
    poll.status = PollStatus.CLOSED;
    const optionCount = poll.pollType === PollType.TEXT
      ? (poll.proposedOptions?.length || 0)
      : poll.proposedDates.length;
    if (optionCount > 0) {
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
    const { title, description, proposedDates, proposedOptions, pollType, deadline } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ message: 'Title is required' });
      return;
    }

    const type: PollType = pollType === PollType.TEXT ? PollType.TEXT : PollType.DATE;

    let createData: Record<string, any>;

    if (type === PollType.DATE) {
      if (!Array.isArray(proposedDates) || proposedDates.length < 2) {
        res.status(400).json({ message: 'At least 2 proposed dates are required' });
        return;
      }
      createData = {
        title: title.trim(),
        description: description?.trim(),
        createdBy: userId,
        pollType: type,
        proposedDates: proposedDates.map((d: string) => new Date(d)),
        deadline: deadline ? new Date(deadline) : undefined,
      };
    } else {
      const opts = Array.isArray(proposedOptions)
        ? proposedOptions.map((o: string) => o?.trim()).filter(Boolean)
        : [];
      if (opts.length < 2) {
        res.status(400).json({ message: 'At least 2 options are required' });
        return;
      }
      createData = {
        title: title.trim(),
        description: description?.trim(),
        createdBy: userId,
        pollType: type,
        proposedOptions: opts,
        deadline: deadline ? new Date(deadline) : undefined,
      };
    }

    const poll = await Poll.create(createData);

    logger.info('Poll created', { pollId: poll._id, userId });
    res.status(201).json(poll);
  } catch (error) {
    logger.error('Error creating poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/polls — list polls I created or voted in (auth required)
export const getMyPolls = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id;
    const polls = await Poll.find({
      $or: [
        { createdBy: userId },
        { 'responses.userId': userId },
      ],
    }).populate('createdBy', 'firstName lastName').sort({ createdAt: -1 });
    res.json(polls);
  } catch (error) {
    logger.error('Error fetching polls', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/polls/:uuid — get poll by uuid (public)
export const getPollByUuid = async (req: Request, res: Response): Promise<void> => {
  try {
    const poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    const updatedPoll = await autoCloseIfExpired(poll);
    res.json(updatedPoll);
  } catch (error) {
    logger.error('Error fetching poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/polls/:uuid/responses — add or update vote (public)
export const addResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const poll = await Poll.findOne({ uuid: req.params.uuid });
    if (!poll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    const updatedPoll = await autoCloseIfExpired(poll);
    if (!updatedPoll) {
      res.status(404).json({ message: 'Poll not found' });
      return;
    }
    if (updatedPoll.status === PollStatus.CLOSED) {
      res.status(400).json({ message: 'This poll is closed' });
      return;
    }

    const { name, votes } = req.body;
    const userId = undefined; // public endpoint — never trust userId from body
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ message: 'Name is required' });
      return;
    }
    if (!Array.isArray(votes) || votes.length === 0) {
      res.status(400).json({ message: 'Votes are required' });
      return;
    }
    const validAnswers = ['YES', 'MAYBE', 'NO'];
    const optionCount = updatedPoll.pollType === PollType.TEXT
      ? (updatedPoll.proposedOptions?.length || 0)
      : updatedPoll.proposedDates.length;

    for (const v of votes) {
      if (!Number.isInteger(v.dateIndex) || v.dateIndex < 0 || v.dateIndex >= optionCount) {
        res.status(400).json({ message: 'Invalid date index in votes' });
        return;
      }
      if (!validAnswers.includes(v.answer)) {
        res.status(400).json({ message: 'Invalid vote answer' });
        return;
      }
    }

    // Remove existing response for this voter (by name — public endpoint has no userId)
    updatedPoll.responses = updatedPoll.responses.filter(r =>
      r.name.toLowerCase() !== name.trim().toLowerCase()
    );

    updatedPoll.responses.push({
      name: name.trim(),
      userId: undefined,
      votes,
    });

    await updatedPoll.save();
    logger.info('Poll response added', { pollId: updatedPoll._id, name });
    res.json(updatedPoll);
  } catch (error) {
    logger.error('Error adding poll response', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// DELETE /api/polls/:uuid/responses/:name — delete vote (auth required, owner only)
export const deleteResponse = async (req: Request, res: Response): Promise<void> => {
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
      res.status(400).json({ message: 'Cannot delete vote from a closed poll' });
      return;
    }

    const { name } = req.params;
    
    // Remove the response
    const initialLength = poll.responses.length;
    poll.responses = poll.responses.filter(r => r.name.toLowerCase() !== name.toLowerCase());
    
    if (poll.responses.length === initialLength) {
      res.status(404).json({ message: 'Response not found' });
      return;
    }

    await poll.save();
    res.json(poll);
  } catch (error) {
    logger.error('Error deleting poll response', { error });
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
    const optionCount = poll.pollType === PollType.TEXT
      ? (poll.proposedOptions?.length || 0)
      : poll.proposedDates.length;
    if (optionCount > 0) {
      poll.winnerDateIndex = computeWinnerIndex(poll);
    }
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
    if (poll.pollType === PollType.TEXT) {
      res.status(400).json({ message: 'Event creation is only available for date polls' });
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
    const startTime = winnerDate.toISOString().slice(11, 16); // "HH:MM" in UTC

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
    poll.resultEventUuid = (event as any).uuid as string;
    await poll.save();

    logger.info('Event created from poll', { pollId: poll._id, eventId: event._id });
    res.status(201).json({ poll, event });
  } catch (error) {
    logger.error('Error confirming poll', { error });
    res.status(500).json({ message: 'Server error' });
  }
};

// PUT /api/polls/:uuid — update poll (auth required, owner only, OPEN only)
export const updatePoll = async (req: Request, res: Response): Promise<void> => {
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
      res.status(400).json({ message: 'Cannot edit a closed poll' });
      return;
    }

    const { title, description, proposedDates, proposedOptions, deadline } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ message: 'Title is required' });
        return;
      }
      poll.title = title.trim();
    }
    if (description !== undefined) poll.description = description?.trim() || undefined;
    if (deadline !== undefined) poll.deadline = deadline ? new Date(deadline) : undefined;

    if (poll.pollType !== PollType.TEXT) {
      if (proposedDates !== undefined) {
        if (!Array.isArray(proposedDates) || proposedDates.length < 2) {
          res.status(400).json({ message: 'At least 2 proposed dates are required' });
          return;
        }
        poll.proposedDates = proposedDates.map((d: string) => new Date(d));
      }
    } else {
      if (proposedOptions !== undefined) {
        const opts = proposedOptions.map((o: string) => o?.trim()).filter(Boolean);
        if (opts.length < 2) {
          res.status(400).json({ message: 'At least 2 options are required' });
          return;
        }
        poll.proposedOptions = opts;
      }
    }

    await poll.save();
    logger.info('Poll updated', { pollId: poll._id, userId });
    res.json(poll);
  } catch (error) {
    logger.error('Error updating poll', { error });
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
