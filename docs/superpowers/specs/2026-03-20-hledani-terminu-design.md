# Hledání termínu — Design Spec

**Date:** 2026-03-20
**Status:** Approved

---

## Overview

A new feature allowing a group of people to find a common date for a one-time event. The organizer proposes specific candidate dates, participants vote (Yes / Maybe / No) via a public link (no login required), and the system automatically determines a winner. The organizer then confirms and optionally creates a ONE_TIME Event from the winning date.

---

## Data Model

New MongoDB collection: `Poll`

```typescript
enum PollStatus { OPEN = 'OPEN', CLOSED = 'CLOSED' }
enum VoteAnswer { YES = 'YES', MAYBE = 'MAYBE', NO = 'NO' }

interface PollResponse {
  name: string           // voter's display name (free text)
  userId?: ObjectId      // ref → User (if logged in)
  votes: Array<{
    dateIndex: number    // index into proposedDates[]
    answer: VoteAnswer
  }>
}

interface Poll {
  uuid: string           // public link identifier (like Event.uuid)
  title: string          // max 50 chars
  description?: string   // max 200 chars, optional
  createdBy: ObjectId    // ref → User
  proposedDates: Date[]  // candidate datetimes proposed by organizer
  responses: PollResponse[]
  deadline?: Date        // optional closing date
  status: PollStatus     // OPEN | CLOSED
  winnerDateIndex?: number  // set on close (highest YES count, YES+MAYBE as tiebreaker)
  resultEventId?: ObjectId  // ref → Event created after organizer confirms
  createdAt: Date
  updatedAt: Date
}
```

**Key decisions:**
- `dateIndex` in votes references `proposedDates[i]` — avoids duplicating date values
- `name` is a free-text field — anyone with the link can vote without an account
- `resultEventId` links the poll to the ONE_TIME Event created after confirmation

---

## API

All endpoints under `/api/polls`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/polls` | Required | Create a new poll |
| `GET` | `/api/polls` | Required | List polls created by current user (dashboard) |
| `GET` | `/api/polls/:uuid` | Public | Fetch poll with all responses (voting page + results) |
| `POST` | `/api/polls/:uuid/responses` | Public | Add or update a vote |
| `PATCH` | `/api/polls/:uuid/close` | Required (owner) | Manually close the poll, compute winner |
| `POST` | `/api/polls/:uuid/confirm` | Required (owner) | Confirm winner and create ONE_TIME Event |
| `DELETE` | `/api/polls/:uuid` | Required (owner) | Delete a poll |

**Notes:**
- `POST /responses` — if a response already exists for the same `userId` or `name`, it is overwritten (no duplicates)
- `PATCH /close` — sets `status = CLOSED` and computes `winnerDateIndex` (most YES votes; YES+MAYBE as tiebreaker)
- `POST /confirm` — creates a new `ONE_TIME` Event using `proposedDates[winnerDateIndex]` and saves its `_id` to `resultEventId`
- Deadline enforcement: a background check (or on-request) closes polls past their deadline automatically

---

## UI

### Dashboard

The existing Dashboard gains a **tab switcher** at the top:

- **Události** (default) — existing two sections (managed + attending) unchanged
- **Hlasování** — list of polls created by the user

The top-right action button is context-sensitive:
- On "Události" tab → `+ Nový event` (current behavior)
- On "Hlasování" tab → `+ Nové hlasování`

### Poll Creation — `/poll/create`

Form fields:
- Title (required, max 50 chars)
- Description (optional, max 200 chars)
- Proposed dates — dynamic list, each entry is a datetime picker; at least 2 required
- Deadline — optional date picker

### Public Voting Page — `/poll/:uuid`

Accessible without login. Shows:
- Poll title and description
- Name input (required before submitting)
- Vote matrix: rows = participants, columns = proposed dates; cells show Yes/Maybe/No
- Current user's row has dropdowns for each date
- Aggregate row at the bottom shows Yes count per date
- "Uložit hlasy" button submits the response

If the poll is CLOSED, voting controls are hidden and the winner is highlighted.

### Poll Detail (Organizer View)

Organizer sees the same voting page plus a management panel:
- Manual close button (if OPEN)
- Winner highlight with vote summary (if CLOSED and no Event yet)
- "Vytvořit event z tohoto termínu" button → calls `POST /confirm` → redirects to the new Event detail page
- Link to the created Event (if `resultEventId` is set)

---

## Winner Calculation

On close (manual or deadline):
1. For each proposed date, count YES votes and YES+MAYBE votes
2. Pick the date with the highest YES count
3. Tiebreaker: highest YES+MAYBE count
4. Further tiebreaker: earliest date index (first proposed wins)

---

## Out of Scope (v1)

- Email notifications when poll is created or closed
- Participants suggesting their own dates
- Linking a poll to an existing recurring Event
- Poll editing after creation
