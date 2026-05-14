# Streak Statistics — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

## Overview

Add four new streak columns to the event statistics table (TEAM_SPORT events only):
current win streak, current loss streak, longest win streak, longest loss streak.

## Rules

- **Absence** (player did not attend the term): ignored — does not affect streak.
- **Term without statistics** (no teams recorded): ignored — does not affect streak.
- **DRAW** breaks both win streak and loss streak.
- **WIN** breaks loss streak; **LOSS** breaks win streak.
- "Current" streak = consecutive results at the end of the chronological sequence.
- "Longest" streak = maximum consecutive run anywhere in the sequence.

## Backend

### New helper function: `computeStreaks`

Located at module scope in `server/src/controllers/eventController.ts`, alongside `getUniqueAttendees`.

**Input:** `results: ('WIN' | 'LOSS' | 'DRAW')[]` — chronologically ordered, containing only terms where the player was present AND the term had statistics.

**Output:**
```typescript
{
  currentWinStreak: number,
  currentLossStreak: number,
  longestWinStreak: number,
  longestLossStreak: number
}
```

**Algorithm:**
```
currentWin = 0; currentLoss = 0; longestWin = 0; longestLoss = 0
tempWin = 0; tempLoss = 0

for each result in results:
  if WIN:
    tempWin++; tempLoss = 0
    longestWin = max(longestWin, tempWin)
  else if LOSS:
    tempLoss++; tempWin = 0
    longestLoss = max(longestLoss, tempLoss)
  else (DRAW):
    tempWin = 0; tempLoss = 0

currentWin = tempWin   // final tempWin = last unbroken win streak
currentLoss = tempLoss // final tempLoss = last unbroken loss streak
```

### Changes to `statsMap` entry

Add `results: ('WIN' | 'LOSS' | 'DRAW')[]` to the entry type. During term iteration, after assigning a WIN/DRAW/LOSS outcome to a player, push the outcome to `statsMap.get(key)!.results`.

The `results` array must be populated in **chronological order** — terms are already sorted `date: 1`, so iteration order is correct.

### Changes to response

After aggregation, call `computeStreaks(s.results)` per player and spread the result into the response object. The `results` array itself is **not** included in the response (internal only).

New fields added to each stats object:
```json
{
  "currentWinStreak": 3,
  "currentLossStreak": 0,
  "longestWinStreak": 5,
  "longestLossStreak": 2
}
```

## Frontend

### `PlayerStat` interface

Add four fields:
```typescript
currentWinStreak: number;
currentLossStreak: number;
longestWinStreak: number;
longestLossStreak: number;
```

### Stats table columns

Four new columns, appended after `lossPct`, filtered by `activityType === 'TEAM_SPORT'`. Each column header shows a short abbreviation; the full description lives in the `title` tooltip attribute.

| Field | CZ label | EN label | CZ tooltip | EN tooltip |
|---|---|---|---|---|
| `currentWinStreak` | AŠV | CWS | Aktuální šňůra výher | Current Win Streak |
| `currentLossStreak` | AŠP | CLS | Aktuální šňůra proher | Current Loss Streak |
| `longestWinStreak` | NŠV | LWS | Nejdelší šňůra výher | Longest Win Streak |
| `longestLossStreak` | NŠP | LLS | Nejdelší šňůra proher | Longest Loss Streak |

All four columns are sortable (same `handleSort` mechanism as existing columns).

**Highlighting:** `longestWinStreak` — highlight max value green (same pattern as `maxWins` in `statsHighlights`). `longestLossStreak` — highlight max value. `currentWinStreak` and `currentLossStreak` — no highlighting (not meaningful to compare current streaks).

### `statsHighlights` useMemo

Add two new highlight values:
```typescript
maxLongestWinStreak: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.longestWinStreak)) : -1,
maxLongestLossStreak: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.longestLossStreak)) : -1
```

### Translation keys (`LanguageContext.tsx`)

Add 8 new keys following the existing pattern:

```typescript
'currentWinStreak':      { en: 'CWS', cs: 'AŠV' },
'currentLossStreak':     { en: 'CLS', cs: 'AŠP' },
'longestWinStreak':      { en: 'LWS', cs: 'NŠV' },
'longestLossStreak':     { en: 'LLS', cs: 'NŠP' },
'currentWinStreakFull':  { en: 'Current Win Streak',  cs: 'Aktuální šňůra výher' },
'currentLossStreakFull': { en: 'Current Loss Streak', cs: 'Aktuální šňůra proher' },
'longestWinStreakFull':  { en: 'Longest Win Streak',  cs: 'Nejdelší šňůra výher' },
'longestLossStreakFull': { en: 'Longest Loss Streak', cs: 'Nejdelší šňůra proher' },
```

## Files changed

| File | Change |
|---|---|
| `server/src/controllers/eventController.ts` | Add `computeStreaks`, add `results[]` to statsMap, call `computeStreaks` in response mapping |
| `client/src/pages/EventDetailPage.tsx` | Add 4 fields to `PlayerStat`, add 4 columns to table, extend `statsHighlights` |
| `client/src/context/LanguageContext.tsx` | Add 8 translation keys |
