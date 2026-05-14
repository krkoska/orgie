# Streak Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four streak columns (AŠV/CWS, AŠP/CLS, NŠV/LWS, NŠP/LLS) to the event statistics table by computing streaks server-side in `getEventStats`.

**Architecture:** A new `computeStreaks` helper at module scope takes a chronologically ordered array of `'WIN' | 'DRAW' | 'LOSS'` results and returns the four streak values. The `statsMap` gains a `results[]` field populated during term iteration; after aggregation, `computeStreaks` is called per player and its output is spread into the response. The frontend adds 4 fields to `PlayerStat`, 4 column headers with tooltips, 4 table cells, 2 highlight values, and 8 translation keys.

**Tech Stack:** Node.js/TypeScript/Express (backend), React/TypeScript (frontend)

---

## File map

| File | Change |
|---|---|
| `server/src/controllers/eventController.ts` | Add `computeStreaks` at module scope; add `results` field to statsMap; push outcomes to `results`; spread streak fields in response |
| `client/src/context/LanguageContext.tsx` | Add 8 translation keys |
| `client/src/pages/EventDetailPage.tsx` | Add 4 fields to `PlayerStat`; add 2 highlights; add 4 column defs with tooltip; add 4 table cells; update colSpan; add `title` to `<th>` |

---

## Task 1: Backend — `computeStreaks` + response fields

**Files:**
- Modify: `server/src/controllers/eventController.ts`

- [ ] **Step 1: Add `computeStreaks` helper at module scope**

Place this function immediately after `getUniqueAttendees` (around line 55), before the first exported controller function.

```typescript
function computeStreaks(results: ('WIN' | 'LOSS' | 'DRAW')[]): {
    currentWinStreak: number;
    currentLossStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
} {
    let tempWin = 0, tempLoss = 0, longestWin = 0, longestLoss = 0;
    for (const r of results) {
        if (r === 'WIN') {
            tempWin++;
            tempLoss = 0;
            if (tempWin > longestWin) longestWin = tempWin;
        } else if (r === 'LOSS') {
            tempLoss++;
            tempWin = 0;
            if (tempLoss > longestLoss) longestLoss = tempLoss;
        } else {
            tempWin = 0;
            tempLoss = 0;
        }
    }
    return { currentWinStreak: tempWin, currentLossStreak: tempLoss, longestWinStreak: longestWin, longestLossStreak: longestLoss };
}
```

- [ ] **Step 2: Add `results` field to `statsMap` type and all `statsMap.set` calls**

In `getEventStats`, the `statsMap` type declaration (currently around line 957) reads:
```typescript
const statsMap = new Map<string, {
    id: string; kind: 'USER' | 'GUEST'; name: string;
    attendance: number; wins: number; draws: number; losses: number; totalGames: number;
}>();
```

Change it to:
```typescript
const statsMap = new Map<string, {
    id: string; kind: 'USER' | 'GUEST'; name: string;
    attendance: number; wins: number; draws: number; losses: number; totalGames: number;
    results: ('WIN' | 'LOSS' | 'DRAW')[];
}>();
```

There are three `statsMap.set(key, { ... })` calls in the function. Add `results: []` to each of them. They are at approximately:
- Line 976 (event.attendees initialization loop)
- Line 983 (event.guests initialization loop)
- Line 1006 (term attendees — new attendees discovered during iteration)

Each currently ends with `totalGames: 0 }` — change to `totalGames: 0, results: [] }`.

- [ ] **Step 3: Push outcome to `results` during term iteration**

Find the outcome assignment block (around line 1030–1039):
```typescript
const outcome = isTop ? (singleWinner ? 'WIN' : 'DRAW') : 'LOSS';
team.members.forEach((member: any) => {
    const key = `${member.kind}-${member.id}`;
    const stats = statsMap.get(key);
    if (stats && termAttendeeKeys.has(key)) {
        if (outcome === 'WIN') stats.wins += 1;
        else if (outcome === 'DRAW') stats.draws += 1;
        else stats.losses += 1;
        stats.totalGames += 1;
    }
});
```

Add `stats.results.push(outcome);` after `stats.totalGames += 1;`:
```typescript
if (stats && termAttendeeKeys.has(key)) {
    if (outcome === 'WIN') stats.wins += 1;
    else if (outcome === 'DRAW') stats.draws += 1;
    else stats.losses += 1;
    stats.totalGames += 1;
    stats.results.push(outcome);
}
```

- [ ] **Step 4: Call `computeStreaks` in the response mapping**

The final mapping (around line 1046) currently reads:
```typescript
const stats = Array.from(statsMap.values()).map(s => ({
    ...s,
    attendancePct: totalTerms > 0 ? (s.attendance / totalTerms) * 100 : 0,
    winPct: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
    lossPct: s.totalGames > 0 ? (s.losses / s.totalGames) * 100 : 0
}));
```

Change to (note: `results` is omitted from response via destructuring):
```typescript
const stats = Array.from(statsMap.values()).map(({ results, ...s }) => ({
    ...s,
    attendancePct: totalTerms > 0 ? (s.attendance / totalTerms) * 100 : 0,
    winPct: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
    lossPct: s.totalGames > 0 ? (s.losses / s.totalGames) * 100 : 0,
    ...computeStreaks(results)
}));
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/eventController.ts
git commit -m "feat: compute streak statistics in getEventStats"
```

---

## Task 2: Frontend — translations, PlayerStat, table columns and cells

**Files:**
- Modify: `client/src/context/LanguageContext.tsx`
- Modify: `client/src/pages/EventDetailPage.tsx`

### Part A — Translation keys

- [ ] **Step 1: Add 8 translation keys to LanguageContext.tsx**

Find the `lossPercentage` key (line 159):
```typescript
'lossPercentage': { en: 'Loss %', cs: 'Prohry %' },
```

Add the 8 new keys immediately after it:
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

### Part B — PlayerStat interface

- [ ] **Step 2: Add 4 fields to `PlayerStat` interface**

Find `PlayerStat` (around line 81):
```typescript
interface PlayerStat {
    ...
    winPct: number;
    lossPct: number;
}
```

Add after `lossPct`:
```typescript
    currentWinStreak: number;
    currentLossStreak: number;
    longestWinStreak: number;
    longestLossStreak: number;
```

### Part C — statsHighlights

- [ ] **Step 3: Add 2 new highlight values to `statsHighlights` useMemo**

Find the `statsHighlights` useMemo (around line 489). It currently returns:
```typescript
return {
    maxAttendance: ...,
    maxAttendancePct: ...,
    maxWins: ...,
    maxLosses: ...,
    maxWinPct: ...,
    maxLossPct: ...
};
```

Add two fields:
```typescript
return {
    maxAttendance: Math.max(...globalStats.map(s => s.attendance)),
    maxAttendancePct: Math.max(...globalStats.map(s => s.attendancePct)),
    maxWins: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.wins)) : -1,
    maxLosses: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.losses)) : -1,
    maxWinPct: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.winPct)) : -1,
    maxLossPct: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.lossPct)) : -1,
    maxLongestWinStreak: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.longestWinStreak)) : -1,
    maxLongestLossStreak: playedStats.length > 0 ? Math.max(...playedStats.map(s => s.longestLossStreak)) : -1
};
```

Also update the fallback return at the top of `statsHighlights` (the empty-state guard):
```typescript
if (!globalStats.length) return { maxAttendance: -1, maxAttendancePct: -1, maxWinPct: -1, maxLossPct: -1, maxWins: -1, maxLosses: -1, maxLongestWinStreak: -1, maxLongestLossStreak: -1 };
```

### Part D — Column headers

- [ ] **Step 4: Add `title` support to `<th>` and 4 new column definitions**

The column array (lines 895–903) currently has objects with `{ key, label, align, teamOnly }`. Extend the 4 new entries to carry a `tooltip` field, and update the `<th>` to render it.

First, update the `<th>` element (currently around line 905) to add `title`:
```tsx
<th
    key={col.key}
    onClick={() => handleSort(col.key)}
    title={(col as any).tooltip}
    style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        textAlign: col.align as any,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap'
    }}
>
```

Then add the 4 new columns to the array after `lossPct`:
```typescript
{ key: 'currentWinStreak',  label: t('currentWinStreak'),  tooltip: t('currentWinStreakFull'),  align: 'center', teamOnly: true },
{ key: 'currentLossStreak', label: t('currentLossStreak'), tooltip: t('currentLossStreakFull'), align: 'center', teamOnly: true },
{ key: 'longestWinStreak',  label: t('longestWinStreak'),  tooltip: t('longestWinStreakFull'),  align: 'center', teamOnly: true },
{ key: 'longestLossStreak', label: t('longestLossStreak'), tooltip: t('longestLossStreakFull'), align: 'center', teamOnly: true }
```

### Part E — Table cells

- [ ] **Step 5: Add 4 table cells inside the TEAM_SPORT block**

Find the closing `</>` of the TEAM_SPORT fragment (currently after the `lossPct` cell, around line 989). Add the 4 new cells before it:

```tsx
<td style={{ padding: '12px 16px', textAlign: 'center' }}>
    {s.currentWinStreak}
</td>
<td style={{ padding: '12px 16px', textAlign: 'center' }}>
    {s.currentLossStreak}
</td>
<td style={{
    padding: '12px 16px',
    textAlign: 'center',
    color: s.longestWinStreak > 0 && s.longestWinStreak === statsHighlights.maxLongestWinStreak ? '#10b981' : 'inherit',
    fontWeight: s.longestWinStreak > 0 && s.longestWinStreak === statsHighlights.maxLongestWinStreak ? 600 : 400
}}>
    {s.longestWinStreak}
</td>
<td style={{
    padding: '12px 16px',
    textAlign: 'center',
    color: s.longestLossStreak > 0 && s.longestLossStreak === statsHighlights.maxLongestLossStreak ? '#ef4444' : 'inherit',
    fontWeight: s.longestLossStreak > 0 && s.longestLossStreak === statsHighlights.maxLongestLossStreak ? 600 : 400
}}>
    {s.longestLossStreak}
</td>
```

### Part F — colSpan

- [ ] **Step 6: Update `colSpan` on the empty-state row**

Find `colSpan={8}` (line 930). Change to a computed value:
```tsx
colSpan={event?.activityType === 'TEAM_SPORT' ? 12 : 3}
```

### Part G — Verify and commit

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/context/LanguageContext.tsx client/src/pages/EventDetailPage.tsx
git commit -m "feat: add streak columns to stats table (AŠV/AŠP/NŠV/NŠP)"
```
