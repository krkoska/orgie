# Event Statistics — Server-Side Aggregation

**Date:** 2026-05-14  
**Status:** Approved

## Problem

Statistics on the event detail page are currently computed entirely on the frontend (`EventDetailPage.tsx:442–600`, `globalStats` useMemo). The browser fetches all archived terms with fully-populated attendee objects and team statistics, then iterates over everything to produce per-player aggregates. For events with 50–200 archived terms, this creates two bottlenecks: large network payload and slow in-browser computation.

## Solution

Move aggregation to the backend. A new dedicated endpoint computes and returns the final stats table. The frontend drops the aggregation logic entirely and only renders what it receives.

## API

```
GET /events/uuid/:uuid/stats
```

**Authentication:** not required (consistent with `/archived`)

**Query parameters:**
- `allSeasons=true` — aggregate across all seasons
- `seasonIdx=N` — filter to a specific season (0-indexed, maps to `event.seasons[N]`)

Default (no params): all archived terms, no season filter.

**Response:** array of player stat objects

```json
[
  {
    "id": "abc123",
    "kind": "USER",
    "name": "Jan Novák",
    "attendance": 12,
    "attendancePct": 80.0,
    "wins": 7,
    "draws": 2,
    "losses": 3,
    "totalGames": 12,
    "winPct": 58.3,
    "lossPct": 25.0
  }
]
```

Additional stat fields can be added to each object in future iterations without breaking existing consumers.

## Backend

**New function:** `getEventStats` in `server/src/controllers/eventController.ts`

**New route:** `router.get('/uuid/:uuid/stats', getEventStats)` in `server/src/routes/eventRoutes.ts`

**Logic:**
1. Find event by uuid; 404 if not found
2. Fetch archived terms using the same time-filtering logic as `getArchivedTerms` (Prague timezone, terms where end time has passed)
3. Filter terms by season if query params specify one:
   - `allSeasons=true`: use all archived terms
   - `seasonIdx=N`: keep terms whose `date` falls within `event.seasons[N].startDate`–`event.seasons[N].endDate`
   - No param: use all archived terms (same as allSeasons)
4. Populate attendees (`firstName lastName nickname preferNickname`) — same populate as `getArchivedTerms`
5. Aggregate using the same algorithm currently in `globalStats` useMemo:
   - Build a statsMap keyed by `${kind}-${id}`
   - Initialize with all current event participants (attendees + guests)
   - Per term: deduplicate attendees, increment attendance counter
   - Per term with `statistics.teams`: sort teams by wins→draws→losses, assign WIN/DRAW/LOSS to members who attended
6. Return array with computed `attendancePct`, `winPct`, `lossPct`

## Frontend

**`EventDetailPage.tsx` changes:**

Remove:
- `globalStats` useMemo (lines 442–600) — entire aggregation logic

Replace with:
- `const [globalStats, setGlobalStats] = useState<PlayerStat[]>([])`
- `const [statsLoading, setStatsLoading] = useState(false)`
- `async function fetchStats()` — calls `GET /events/uuid/:uuid/stats` with current `seasonIdx`/`allSeasons` params
- `useEffect` dependent on `[selectedSeasonIdx, showAllSeasonsStats, uuid]` — calls `fetchStats()` on change

Keep unchanged:
- `statsHighlights` useMemo — already lightweight, just finds max values in the already-aggregated array
- `filledStatsCount` useMemo — counts terms with statistics, doesn't need heavy data
- `sortConfig` state and sort logic — sorting a small final array client-side is fine
- Stats table render code — no changes needed

**Loading state:** show a spinner in the stats section while `statsLoading` is true.

## Data flow

```
Before:
  /archived  →  [full term objects × 50–200]  →  useMemo aggregation  →  render table

After:
  /archived  →  [full term objects × 50–200]  →  render archive list
  /stats     →  [player stats × N players]    →  render table
```

The `/archived` endpoint remains unchanged and continues serving the archive term-card list.
