# Event Statistics Backend Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move event statistics aggregation from a frontend `useMemo` to a dedicated backend endpoint, reducing payload size and eliminating in-browser computation.

**Architecture:** New `GET /events/uuid/:uuid/stats` endpoint aggregates per-player attendance and win/draw/loss data on the backend and returns only the final stats table. The frontend replaces the `globalStats` useMemo with a `useState` + fetch call. The existing `/archived` endpoint is unchanged — it still serves the archive term-card list.

**Tech Stack:** Node.js/Express/Mongoose (backend), React/TypeScript (frontend)

---

## File map

| File | Change |
|------|--------|
| `server/src/controllers/eventController.ts` | Add `getEventStats` function |
| `server/src/routes/eventRoutes.ts` | Add `GET /uuid/:uuid/stats` route |
| `client/src/pages/EventDetailPage.tsx` | Replace `globalStats` useMemo with state + fetch; add `statsLoading`; update `handleFetchStats`; add `useEffect` for refetch; update denominator reference |

---

## Task 1: Backend — `getEventStats` controller

**Files:**
- Modify: `server/src/controllers/eventController.ts`

### Response shape

The endpoint returns:

```json
{
  "totalTerms": 45,
  "filledTermsCount": 30,
  "stats": [
    {
      "id": "abc123",
      "kind": "USER",
      "name": "Jan Novák",
      "attendance": 12,
      "attendancePct": 26.7,
      "wins": 7,
      "draws": 2,
      "losses": 3,
      "totalGames": 12,
      "winPct": 58.3,
      "lossPct": 25.0
    }
  ]
}
```

- [ ] **Step 1: Verify the endpoint does not exist yet**

```bash
curl -s http://localhost:5000/api/events/uuid/<any-uuid>/stats
```

Expected: `404 Not Found` or connection refused (server not running). If it returns data, stop — the endpoint already exists.

- [ ] **Step 2: Add `getEventStats` to eventController.ts**

Add this function at the end of the file, before the closing of the module. It mirrors the archived-terms fetching logic from `getArchivedTerms` and the aggregation logic from the frontend `globalStats` useMemo.

```typescript
export const getEventStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid })
            .populate({ path: 'attendees.id', model: 'User', select: 'firstName lastName nickname preferNickname' });
        if (!event) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // --- Fetch archived terms (same logic as getArchivedTerms) ---
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const nextDay = new Date(today);
        nextDay.setDate(nextDay.getDate() + 1);

        const allTermsBeforeOrToday = await Term.find({
            eventId: event._id,
            date: { $lt: nextDay }
        }).sort({ date: 1 });

        const currentWallClock = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Europe/Prague',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).formatToParts(now);

        const find = (type: string) => currentWallClock.find(p => p.type === type)?.value;
        const nowDateStr = `${find('year')}-${find('month')}-${find('day')}`;
        const nowTimeStr = `${find('hour')}:${find('minute')}`;

        let archivedTerms = allTermsBeforeOrToday.filter(t => {
            const termDateStr = new Date(t.date).toISOString().split('T')[0];
            if (termDateStr < nowDateStr) return true;
            if (termDateStr > nowDateStr) return false;
            return nowTimeStr >= t.endTime;
        });

        // --- Season filtering ---
        const { allSeasons, seasonIdx } = req.query;
        if (allSeasons !== 'true' && seasonIdx !== undefined && event.seasons.length > 0) {
            const idx = parseInt(seasonIdx as string, 10);
            const season = event.seasons[idx];
            if (season) {
                const start = new Date(season.startDate);
                start.setHours(0, 0, 0, 0);
                const end = season.endDate ? new Date(season.endDate) : new Date(8640000000000000);
                if (season.endDate) end.setHours(23, 59, 59, 999);
                archivedTerms = archivedTerms.filter(t => {
                    const d = new Date(new Date(t.date).toISOString().split('T')[0]);
                    return d >= start && d <= end;
                });
            }
        }

        // --- Populate attendees ---
        const originalAttendeesPerTerm = archivedTerms.map((t: any) => JSON.parse(JSON.stringify(t.attendees)));

        const populatedTerms = await Promise.all(archivedTerms.map((t: any) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname'
            })
        ));

        const fixedTerms = populatedTerms.map((t: any, tIdx: number) => {
            if (!t) return null;
            const termObj = t.toObject();
            termObj.attendees = termObj.attendees.map((a: any, aIdx: number) => {
                if (a.id === null || a.id === undefined) {
                    const origId = originalAttendeesPerTerm[tIdx][aIdx]?.id;
                    return { ...a, id: origId ? origId.toString() : null };
                }
                return a;
            });
            return termObj;
        }).filter(Boolean);

        const totalTerms = fixedTerms.length;
        const filledTermsCount = fixedTerms.filter((t: any) => t.statistics?.teams?.length > 0).length;

        // --- Aggregation ---
        const statsMap = new Map<string, {
            id: string; kind: 'USER' | 'GUEST'; name: string;
            attendance: number; wins: number; draws: number; losses: number; totalGames: number;
        }>();

        const getUniqueAttendees = <T extends { id: any; kind: 'USER' | 'GUEST' }>(attendees: T[]): T[] => {
            const seen = new Set<string>();
            return attendees.filter(a => {
                if (!a.id) return false;
                const id = typeof a.id === 'object' && a.id._id ? a.id._id : a.id;
                const idStr = id.toString();
                if (seen.has(idStr)) return false;
                seen.add(idStr);
                return true;
            });
        };

        // Initialize from current event participants (event.attendees.id is populated)
        event.attendees.forEach((a: any) => {
            const populated = typeof a.id === 'object' && a.id !== null && a.id._id;
            const id = populated ? a.id._id.toString() : a.id.toString();
            const key = `${a.kind}-${id}`;
            if (!statsMap.has(key)) {
                let name = 'Unknown';
                if (a.kind === 'USER' && populated) {
                    const u = a.id;
                    name = u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                } else if (a.kind === 'GUEST') {
                    const guest = (event.guests as any[]).find((g: any) => g._id.toString() === id);
                    if (guest) name = `${guest.firstName} ${guest.lastName}`;
                }
                statsMap.set(key, { id, kind: a.kind, name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0 });
            }
        });
        (event.guests as any[]).forEach((g: any) => {
            const key = `GUEST-${g._id}`;
            if (!statsMap.has(key)) {
                const name = `${g.firstName} ${g.lastName}`;
                statsMap.set(key, { id: g._id.toString(), kind: 'GUEST', name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0 });
            }
        });

        fixedTerms.forEach((term: any) => {
            const uniqueTermAttendees = getUniqueAttendees(term.attendees);
            const termAttendeeKeys = new Set(uniqueTermAttendees.map((att: any) => {
                const id = typeof att.id === 'object' && att.id !== null ? (att.id._id ?? att.id).toString() : att.id;
                return `${att.kind}-${id}`;
            }));

            uniqueTermAttendees.forEach((att: any) => {
                const id = typeof att.id === 'object' && att.id !== null ? (att.id._id ?? att.id).toString() : att.id;
                const key = `${att.kind}-${id}`;
                if (!statsMap.has(key)) {
                    let name = 'Unknown';
                    if (att.kind === 'USER' && typeof att.id === 'object' && att.id !== null) {
                        const u = att.id;
                        name = u.preferNickname && u.nickname ? u.nickname : `${u.firstName} ${u.lastName}`;
                    } else if (att.kind === 'GUEST') {
                        const guest = (event.guests as any[]).find((g: any) => g._id.toString() === id);
                        if (guest) name = `${guest.firstName} ${guest.lastName}`;
                    }
                    statsMap.set(key, { id, kind: att.kind, name, attendance: 0, wins: 0, draws: 0, losses: 0, totalGames: 0 });
                }
                statsMap.get(key)!.attendance += 1;
            });

            if (term.statistics?.teams?.length > 0) {
                const teamsWithStats = term.statistics.teams.map((t: any) => ({
                    ...t,
                    w: t.wins || 0, d: t.draws || 0, l: t.losses || 0,
                    played: (t.wins || 0) + (t.draws || 0) + (t.losses || 0)
                })).filter((t: any) => t.played > 0);

                if (teamsWithStats.length > 0) {
                    const sortedTeams = [...teamsWithStats].sort((a: any, b: any) => {
                        if (b.w !== a.w) return b.w - a.w;
                        if (b.d !== a.d) return b.d - a.d;
                        return a.l - b.l;
                    });
                    const best = sortedTeams[0];
                    const topTeams = sortedTeams.filter((t: any) => t.w === best.w && t.d === best.d && t.l === best.l);
                    const singleWinner = topTeams.length === 1;

                    teamsWithStats.forEach((team: any) => {
                        const isTop = topTeams.some((tt: any) => tt.name === team.name);
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
                    });
                }
            }
        });

        const stats = Array.from(statsMap.values()).map(s => ({
            ...s,
            attendancePct: totalTerms > 0 ? (s.attendance / totalTerms) * 100 : 0,
            winPct: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
            lossPct: s.totalGames > 0 ? (s.losses / s.totalGames) * 100 : 0
        }));

        res.json({ totalTerms, filledTermsCount, stats });
    } catch (error: any) {
        logger.error('Error computing event stats', { error: error.message, uuid: req.params.uuid });
        res.status(500).json({ message: error.message });
    }
};
```

- [ ] **Step 3: Add the route to eventRoutes.ts**

In `server/src/routes/eventRoutes.ts`, add the import and route:

```typescript
// In the import at the top, add getEventStats:
import { createEvent, getEvents, getMyEvents, getDashboardEvents, deleteEvent, updateEvent, getEventByUuid, generateTerms, deleteTerm, toggleTermAttendance, toggleEventAttendance, getArchivedTerms, deleteArchivedTerms, removeAttendeeFromEvent, addGuestToEvent, updateTermStatistics, getEventStats } from '../controllers/eventController';
```

```typescript
// Add this line after the existing /uuid/:uuid route (line 17):
router.get('/uuid/:uuid/stats', getEventStats);
```

- [ ] **Step 4: Start server and verify endpoint responds**

```bash
cd server && npm run dev
```

Then in a new terminal (replace `<uuid>` with a real event UUID from your DB):

```bash
curl -s "http://localhost:5000/api/events/uuid/<uuid>/stats" | jq '.totalTerms, .filledTermsCount, (.stats | length)'
```

Expected: three numbers — total terms count, terms with statistics count, number of players.

- [ ] **Step 5: Verify season filter works**

```bash
curl -s "http://localhost:5000/api/events/uuid/<uuid>/stats?seasonIdx=0" | jq '.totalTerms'
curl -s "http://localhost:5000/api/events/uuid/<uuid>/stats?allSeasons=true" | jq '.totalTerms'
```

Expected: `seasonIdx=0` returns fewer or equal terms than `allSeasons=true`.

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/eventController.ts server/src/routes/eventRoutes.ts
git commit -m "feat: add GET /events/uuid/:uuid/stats endpoint for server-side stats aggregation"
```

---

## Task 2: Frontend — replace `globalStats` useMemo with fetch

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Add type and state declarations**

After the `showAllSeasonsStats` state (around line 132), add:

```typescript
interface PlayerStat {
    id: string;
    kind: 'USER' | 'GUEST';
    name: string;
    attendance: number;
    attendancePct: number;
    wins: number;
    draws: number;
    losses: number;
    totalGames: number;
    winPct: number;
    lossPct: number;
}

const [globalStats, setGlobalStats] = useState<PlayerStat[]>([]);
const [statsLoading, setStatsLoading] = useState(false);
const [statsTotalTerms, setStatsTotalTerms] = useState(0);
const [statsFilledCount, setStatsFilledCount] = useState(0);
```

- [ ] **Step 2: Add `fetchStats` function**

Add this function after `fetchArchivedTerms` (around line 348):

```typescript
const fetchStats = async () => {
    if (!uuid) return;
    setStatsLoading(true);
    try {
        const params = new URLSearchParams();
        if (showAllSeasonsStats) {
            params.set('allSeasons', 'true');
        } else if (selectedSeasonIdx !== null) {
            params.set('seasonIdx', String(selectedSeasonIdx));
        }
        const { data } = await api.get(`/events/uuid/${uuid}/stats?${params.toString()}`);
        setGlobalStats(data.stats);
        setStatsTotalTerms(data.totalTerms);
        setStatsFilledCount(data.filledTermsCount);
    } catch (err: any) {
        showToast(err.response?.data?.message || 'Failed to load statistics', 'error');
    } finally {
        setStatsLoading(false);
    }
};
```

- [ ] **Step 3: Add `useEffect` to refetch when season selection changes**

Add after the `fetchStats` function:

```typescript
useEffect(() => {
    if (showStats) {
        fetchStats();
    }
}, [showAllSeasonsStats, selectedSeasonIdx]);
```

- [ ] **Step 4: Update `handleFetchStats`**

Replace the existing `handleFetchStats` function (lines 423–433) with:

```typescript
const handleFetchStats = async () => {
    if (!event) return;
    if (showStats) {
        setShowStats(false);
        return;
    }
    await fetchStats();
    setShowStats(true);
};
```

- [ ] **Step 5: Remove the `globalStats` useMemo**

Delete lines 442–600 (the entire `const globalStats = React.useMemo(...)` block).

- [ ] **Step 6: Update `statsHighlights` to use new state**

The `statsHighlights` useMemo currently has `[globalStats]` as dependency — it will still work because `globalStats` is now a state variable instead of a memo. No change needed to `statsHighlights` itself.

Update its dependency array if it currently references `archivedTerms` or `filteredArchivedTerms` — check and remove any such references.

- [ ] **Step 7: Update `filledStatsCount` useMemo**

Replace the existing `filledStatsCount` useMemo with:

```typescript
const filledStatsCount = statsFilledCount;
```

(It's no longer a computed value — the backend sends it directly.)

- [ ] **Step 8: Update the stats table denominator**

Find the line in the stats table (around line 1053):

```tsx
{s.attendance}/{showAllSeasonsStats ? archivedTerms.length : filteredArchivedTerms.length}
```

Replace with:

```tsx
{s.attendance}/{statsTotalTerms}
```

- [ ] **Step 9: Add loading state to stats section**

Find the stats button (around line 988–995):

```tsx
{loadingArchive ? t('loadingArchive') : (showStats ? t('hideStats') : t('showStats'))}
```

Replace with:

```tsx
{statsLoading ? t('loadingArchive') : (showStats ? t('hideStats') : t('showStats'))}
```

Also disable the button while loading:

```tsx
disabled={statsLoading}
```

- [ ] **Step 10: Verify in browser**

Start the dev server:

```bash
cd client && npm run dev
```

1. Open an event detail page with archived terms
2. Click "Show statistics" — stats table should appear, data should match what was shown before
3. If the event has seasons, toggle "All seasons" — table should reload with different counts
4. Switch season in the season selector — stats should reload
5. Open browser DevTools Network tab — confirm the request goes to `/stats` not `/archived` when showing stats

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "feat: fetch event stats from backend endpoint, remove frontend aggregation"
```
