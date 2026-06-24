# Advanced Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nová stránka `/event/:uuid/advanced-stats` s tab navigací (Týmové stats + Účast), přístupná přes ikonu vedle nadpisu „Statistiky" v EventDetailPage.

**Architecture:** Dvě nová backend route + controller funkce sdílející helper pro načtení a populate archivovaných termínů. Frontend: nová stránka `AdvancedStatsPage` s lazy-loading taby, SVG graf účasti vykreslovaný ručně.

**Tech Stack:** React + TypeScript, React Router v6, lucide-react, Express, Mongoose, existující `LanguageContext` pro i18n.

---

## Soubory

| Akce | Cesta | Obsah |
|------|-------|-------|
| Modify | `server/src/controllers/eventController.ts` | +2 nové export funkce: `getAdvancedTeamStats`, `getAdvancedAttendanceStats` |
| Modify | `server/src/routes/eventRoutes.ts` | +2 nové GET routy |
| Create | `client/src/pages/AdvancedStatsPage.tsx` | Nová stránka s tab navigací |
| Create | `client/src/components/advanced-stats/TeamStatsTab.tsx` | Tab Týmové stats |
| Create | `client/src/components/advanced-stats/AttendanceTab.tsx` | Tab Účast |
| Create | `client/src/components/advanced-stats/AttendanceChart.tsx` | SVG čárový graf |
| Modify | `client/src/App.tsx` | +1 route |
| Modify | `client/src/pages/EventDetailPage.tsx` | +ikona odkaz vedle nadpisu Statistiky |
| Modify | `client/src/context/LanguageContext.tsx` | +nové překlady |

---

## Task 1: Backend helper — načtení archivovaných termínů se statistikami

Existující logika v `getEventStats` (cca řádky 917–1000 v `eventController.ts`) načítá a populuje archivované termíny. Tuto logiku extrahujeme do privátní helper funkce, aby ji mohly sdílet nové endpointy.

**Files:**
- Modify: `server/src/controllers/eventController.ts`

- [ ] **Step 1: Přidej helper funkci `getPopulatedArchivedTerms` před `getEventStats`**

Vlož tuto privátní funkci do `eventController.ts` těsně před `export const getEventStats`. Funkce přijme `eventId` (string) a `seasonIdx` (number | null — null = všechny sezony) a vrátí populate termíny i původní event dokument.

```typescript
// Vrací archivované termíny pro daný event, populate attendees.id
const getPopulatedArchivedTerms = async (
    eventId: string,
    seasonIdx: number | null
): Promise<{ fixedTerms: any[]; event: any }> => {
    const event = await Event.findById(eventId)
        .populate('ownerId', 'firstName lastName nickname preferNickname')
        .populate('administrators', 'firstName lastName nickname preferNickname');
    if (!event) throw new Error('Event not found');

    const eventObj = (event as any).toObject ? (event as any).toObject() : event;

    let dateFilter: any = {};
    if (seasonIdx !== null && eventObj.seasons && eventObj.seasons[seasonIdx]) {
        const season = eventObj.seasons[seasonIdx];
        dateFilter.date = { $gte: new Date(season.startDate) };
        if (season.endDate) dateFilter.date.$lte = new Date(season.endDate);
    }

    const archivedTerms = await Term.find({
        eventId: eventId,
        archived: true,
        ...dateFilter
    }).sort({ date: 1 });

    const originalAttendeesPerTerm = archivedTerms.map((t: any) =>
        JSON.parse(JSON.stringify(t.attendees))
    );

    const populatedTerms = await Promise.all(
        archivedTerms.map((t: any) =>
            Term.findById(t._id).populate({
                path: 'attendees.id',
                model: 'User',
                select: 'firstName lastName nickname preferNickname'
            })
        )
    );

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

    return { fixedTerms, event: eventObj };
};
```

- [ ] **Step 2: Build projekt aby se ověřilo, že helper nezpůsobí TypeScript chyby**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -5
```

Očekávání: žádné nové chyby (helper je serverový kód, build kontroluje client — ale ujisti se že server se zkompiluje):

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit 2>&1 | tail -10
```

Očekávání: žádný výstup (žádné chyby).

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/eventController.ts
git commit -m "refactor: extract getPopulatedArchivedTerms helper in eventController"
```

---

## Task 2: Backend endpoint — Týmové statistiky

**Files:**
- Modify: `server/src/controllers/eventController.ts` (přidat `getAdvancedTeamStats`)
- Modify: `server/src/routes/eventRoutes.ts`

- [ ] **Step 1: Přidej export funkci `getAdvancedTeamStats` do eventController.ts**

Přidej za `getPopulatedArchivedTerms`, před `getEventStats`:

```typescript
export const getAdvancedTeamStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const seasonIdx = req.query.season !== undefined ? Number(req.query.season) : null;
        const { fixedTerms } = await getPopulatedArchivedTerms(
            (event._id as any).toString(),
            seasonIdx
        );

        // Helper: jméno účastníka
        const getName = (a: any): string => {
            if (a.kind === 'GUEST') return a.guestName || 'Guest';
            const u = a.id;
            if (!u) return 'Unknown';
            return (u.preferNickname && u.nickname) ? u.nickname : `${u.firstName} ${u.lastName}`;
        };
        const getKey = (a: any): string =>
            a.kind === 'GUEST' ? `GUEST-${a.id}` : `USER-${(a.id?._id || a.id).toString()}`;

        // Mapa: klíč dvojice/trojice → { players, count, wins, gamesTotal }
        const pairsFreq = new Map<string, { players: {id:string,kind:string,name:string}[], count:number }>();
        const pairsWin  = new Map<string, { players: {id:string,kind:string,name:string}[], wins:number, total:number }>();
        const triosFreq = new Map<string, { players: {id:string,kind:string,name:string}[], count:number }>();
        const triosWin  = new Map<string, { players: {id:string,kind:string,name:string}[], wins:number, total:number }>();

        const termsWithStats = fixedTerms.filter((t: any) => t.statistics?.teams?.length > 0);

        for (const term of termsWithStats) {
            // Zjisti výsledek každého týmu
            const teams: { members: any[]; win: boolean }[] = term.statistics.teams.map((team: any) => {
                // Populate member info z attendees
                const members = (team.members || []).map((m: any) => {
                    const att = term.attendees.find(
                        (a: any) => a.kind === m.kind &&
                            (a.id?._id?.toString() || a.id?.toString()) === m.id.toString()
                    );
                    return att || null;
                }).filter(Boolean);

                return { members, wins: team.wins || 0, draws: team.draws || 0, losses: team.losses || 0 };
            });

            // Najdi vítěze (nejvíce výher; remíza = více týmů sdílí max)
            const maxWins = Math.max(...teams.map((t: any) => t.wins));
            const isWinner = (t: any) => maxWins > 0 && t.wins === maxWins;

            for (const team of teams as any[]) {
                const members = team.members;
                const won = isWinner(team);

                // Kombinace dvojic
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        const pair = [members[i], members[j]].sort((a, b) => getKey(a).localeCompare(getKey(b)));
                        const key = pair.map(getKey).join('|');
                        const players = pair.map(a => ({ id: getKey(a), kind: a.kind, name: getName(a) }));

                        if (!pairsFreq.has(key)) pairsFreq.set(key, { players, count: 0 });
                        pairsFreq.get(key)!.count++;

                        if (!pairsWin.has(key)) pairsWin.set(key, { players, wins: 0, total: 0 });
                        pairsWin.get(key)!.total++;
                        if (won) pairsWin.get(key)!.wins++;
                    }
                }

                // Kombinace trojic
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        for (let k = j + 1; k < members.length; k++) {
                            const trio = [members[i], members[j], members[k]].sort((a, b) => getKey(a).localeCompare(getKey(b)));
                            const key = trio.map(getKey).join('|');
                            const players = trio.map(a => ({ id: getKey(a), kind: a.kind, name: getName(a) }));

                            if (!triosFreq.has(key)) triosFreq.set(key, { players, count: 0 });
                            triosFreq.get(key)!.count++;

                            if (!triosWin.has(key)) triosWin.set(key, { players, wins: 0, total: 0 });
                            triosWin.get(key)!.total++;
                            if (won) triosWin.get(key)!.wins++;
                        }
                    }
                }
            }
        }

        const sortDesc = (arr: any[], key: string) => arr.sort((a, b) => b[key] - a[key]);

        res.json({
            pairsFrequency: sortDesc(Array.from(pairsFreq.values()), 'count'),
            pairsSuccess: sortDesc(
                Array.from(pairsWin.values()).map(p => ({
                    players: p.players,
                    wins: p.wins,
                    total: p.total,
                    winPct: p.total > 0 ? Math.round((p.wins / p.total) * 1000) / 10 : 0
                })),
                'winPct'
            ),
            triosFrequency: sortDesc(Array.from(triosFreq.values()), 'count'),
            triosSuccess: sortDesc(
                Array.from(triosWin.values()).map(p => ({
                    players: p.players,
                    wins: p.wins,
                    total: p.total,
                    winPct: p.total > 0 ? Math.round((p.wins / p.total) * 1000) / 10 : 0
                })),
                'winPct'
            )
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
```

- [ ] **Step 2: Přidej route do eventRoutes.ts**

Najdi řádek `router.get('/uuid/:uuid/stats', protect, getEventStats);` a za něj přidej:

```typescript
router.get('/uuid/:uuid/advanced-stats/team', protect, getAdvancedTeamStats);
```

Přidej import `getAdvancedTeamStats` do importu z eventController na začátku souboru.

- [ ] **Step 3: Ověř TypeScript kompilaci serveru**

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit 2>&1 | tail -10
```

Očekávání: žádný výstup.

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/eventController.ts server/src/routes/eventRoutes.ts
git commit -m "feat: add GET /events/uuid/:uuid/advanced-stats/team endpoint"
```

---

## Task 3: Backend endpoint — Statistiky účasti

**Files:**
- Modify: `server/src/controllers/eventController.ts` (přidat `getAdvancedAttendanceStats`)
- Modify: `server/src/routes/eventRoutes.ts`

- [ ] **Step 1: Přidej export funkci `getAdvancedAttendanceStats`**

Přidej za `getAdvancedTeamStats`:

```typescript
export const getAdvancedAttendanceStats = async (req: Request, res: Response) => {
    try {
        const event = await Event.findOne({ uuid: req.params.uuid });
        if (!event) return res.status(404).json({ message: 'Event not found' });

        const seasonIdx = req.query.season !== undefined ? Number(req.query.season) : null;
        const { fixedTerms } = await getPopulatedArchivedTerms(
            (event._id as any).toString(),
            seasonIdx
        );

        // Pomocná: unikátní účastníci termínu
        const uniqueCount = (term: any): number => {
            const seen = new Set<string>();
            for (const a of term.attendees) {
                const key = `${a.kind}-${a.id?._id?.toString() || a.id?.toString()}`;
                seen.add(key);
            }
            return seen.size;
        };

        // Timeline — každý termín s datem, týdnem, měsícem a počtem hráčů
        const locale = (req.query.lang as string) || 'cs';
        const monthNames: Record<string, string[]> = {
            cs: ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'],
            en: ['January','February','March','April','May','June','July','August','September','October','November','December']
        };
        const months = monthNames[locale] || monthNames['cs'];

        const timeline = fixedTerms.map((term: any, idx: number) => {
            const date = new Date(term.date);
            return {
                date: date.toISOString().slice(0, 10),
                week: idx + 1,
                month: months[date.getMonth()],
                attendeeCount: uniqueCount(term)
            };
        });

        // Distribuce podle počtu hráčů
        const byPlayerCountMap = new Map<number, number>();
        for (const t of fixedTerms) {
            const c = uniqueCount(t);
            byPlayerCountMap.set(c, (byPlayerCountMap.get(c) || 0) + 1);
        }
        const byPlayerCount = Array.from(byPlayerCountMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([count, terms]) => ({ count, terms }));

        // Distribuce podle počtu týmů
        const byTeamCountMap = new Map<number, number>();
        for (const t of fixedTerms) {
            if (t.statistics?.teams?.length > 0) {
                const n = t.statistics.teams.length;
                byTeamCountMap.set(n, (byTeamCountMap.get(n) || 0) + 1);
            }
        }
        const byTeamCount = Array.from(byTeamCountMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([teams, terms]) => ({ teams, terms }));

        res.json({ timeline, byPlayerCount, byTeamCount });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
```

- [ ] **Step 2: Přidej route do eventRoutes.ts**

Za řádek přidaný v Task 2 přidej:

```typescript
router.get('/uuid/:uuid/advanced-stats/attendance', protect, getAdvancedAttendanceStats);
```

Přidej import `getAdvancedAttendanceStats` na začátek souboru.

- [ ] **Step 3: Ověř TypeScript kompilaci**

```bash
cd /Users/koudelka/Koudelka/orgie/server && npx tsc --noEmit 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/eventController.ts server/src/routes/eventRoutes.ts
git commit -m "feat: add GET /events/uuid/:uuid/advanced-stats/attendance endpoint"
```

---

## Task 4: Překlady v LanguageContext

**Files:**
- Modify: `client/src/context/LanguageContext.tsx`

- [ ] **Step 1: Přidej nové klíče do objektu `translations`**

Najdi konec objektu `translations` (před `language: Language;`) a přidej:

```typescript
'advancedStats':        { en: 'Advanced Statistics', cs: 'Pokročilé statistiky' },
'teamStats':            { en: 'Team Stats', cs: 'Týmové stats' },
'attendanceTab':        { en: 'Attendance', cs: 'Účast' },
'mostFreqPairs':        { en: 'Most frequent pairs', cs: 'Nejčastější dvojice' },
'mostSuccPairs':        { en: 'Most successful pairs', cs: 'Nejúspěšnější dvojice' },
'mostFreqTrios':        { en: 'Most frequent trios', cs: 'Nejčastější trojice' },
'mostSuccTrios':        { en: 'Most successful trios', cs: 'Nejúspěšnější trojice' },
'showAll':              { en: 'Show all ({n})', cs: 'Zobrazit všechny ({n})' },
'colPair':              { en: 'Pair', cs: 'Dvojice' },
'colTrio':              { en: 'Trio', cs: 'Trojice' },
'colWins':              { en: 'Wins', cs: 'Výhry' },
'colWinPct':            { en: 'Win %', cs: '% výher' },
'attendanceByPlayers':  { en: 'Terms by player count', cs: 'Termíny podle počtu hráčů' },
'attendanceByTeams':    { en: 'Terms by team count', cs: 'Termíny podle počtu týmů' },
'attendanceChart':      { en: 'Attendance over season', cs: 'Vývoj účasti v sezoně' },
'avgAttendance':        { en: 'avg.', cs: 'prům.' },
'players':              { en: 'players', cs: 'hráčů' },
'teams':                { en: 'teams', cs: 'týmů' },
'noDataYet':            { en: 'No data yet', cs: 'Zatím žádná data' },
```

- [ ] **Step 2: Build pro ověření**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -5
```

Očekávání: build projde bez chyb.

- [ ] **Step 3: Commit**

```bash
git add client/src/context/LanguageContext.tsx
git commit -m "feat: add i18n keys for advanced stats page"
```

---

## Task 5: SVG graf účasti `AttendanceChart.tsx`

**Files:**
- Create: `client/src/components/advanced-stats/AttendanceChart.tsx`

- [ ] **Step 1: Vytvoř komponentu**

```tsx
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface TimelinePoint {
    date: string;
    week: number;
    month: string;
    attendeeCount: number;
}

interface Props {
    timeline: TimelinePoint[];
}

const WIDTH = 560;
const HEIGHT = 160;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 52; // prostor pro týdny + měsíce

const AttendanceChart: React.FC<Props> = ({ timeline }) => {
    const { t } = useLanguage();

    if (timeline.length === 0) {
        return <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>{t('noDataYet')}</p>;
    }

    const counts = timeline.map(p => p.attendeeCount);
    const minC = Math.min(...counts);
    const maxC = Math.max(...counts);
    const range = maxC - minC || 1;

    const chartW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const chartH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xOf = (i: number) => PAD_LEFT + (i / (timeline.length - 1 || 1)) * chartW;
    const yOf = (c: number) => PAD_TOP + chartH - ((c - minC) / range) * chartH;

    // Cubic bezier smooth path
    const smoothPath = (pts: {x:number,y:number}[]): string => {
        if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
        let d = `M ${pts[0].x},${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const cpX = (prev.x + curr.x) / 2;
            d += ` C ${cpX},${prev.y} ${cpX},${curr.y} ${curr.x},${curr.y}`;
        }
        return d;
    };

    const pts = timeline.map((p, i) => ({ x: xOf(i), y: yOf(p.attendeeCount) }));
    const linePath = smoothPath(pts);

    // Area path (uzavřená)
    const areaPath = linePath +
        ` L ${pts[pts.length - 1].x},${PAD_TOP + chartH}` +
        ` L ${pts[0].x},${PAD_TOP + chartH} Z`;

    // Průměr
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const avgY = yOf(avg);

    // Y osa — zobraz min, max a průměr jako celá čísla
    const yLabels = Array.from(new Set([minC, Math.round(avg), maxC])).sort((a, b) => a - b);

    // Měsíční skupiny pro X osu
    const monthGroups: { month: string; startX: number; endX: number }[] = [];
    let curMonth = '';
    let startIdx = 0;
    timeline.forEach((p, i) => {
        if (p.month !== curMonth) {
            if (curMonth !== '') {
                monthGroups.push({ month: curMonth, startX: xOf(startIdx), endX: xOf(i - 1) });
            }
            curMonth = p.month;
            startIdx = i;
        }
    });
    monthGroups.push({ month: curMonth, startX: xOf(startIdx), endX: xOf(timeline.length - 1) });

    return (
        <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Grid lines per y label */}
            {yLabels.map(v => (
                <line key={v} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yOf(v)} y2={yOf(v)}
                    stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4,3" />
            ))}

            {/* Axes */}
            <line x1={PAD_LEFT} x2={PAD_LEFT} y1={PAD_TOP} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={PAD_TOP + chartH} y2={PAD_TOP + chartH} stroke="#e5e7eb" strokeWidth="1" />

            {/* Y labels */}
            {yLabels.map(v => (
                <text key={v} x={PAD_LEFT - 6} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
            ))}

            {/* Area */}
            <path d={areaPath} fill="#3b82f6" fillOpacity="0.10" />

            {/* Line */}
            <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />

            {/* Dots */}
            {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill="white" stroke="#3b82f6" strokeWidth="2" />
            ))}

            {/* Average line */}
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={avgY} y2={avgY}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,3" />
            <text x={WIDTH - PAD_RIGHT + 2} y={avgY + 4} fontSize="9" fill="#f59e0b">
                {t('avgAttendance')} {avg.toFixed(1)}
            </text>

            {/* X — týden labels */}
            {timeline.map((p, i) => (
                <text key={i} x={xOf(i)} y={PAD_TOP + chartH + 14} textAnchor="middle" fontSize="8" fill="#9ca3af">
                    T{p.week}
                </text>
            ))}

            {/* X — měsíční závorky */}
            {monthGroups.map((g, i) => {
                const midX = (g.startX + g.endX) / 2;
                const bracketY = PAD_TOP + chartH + 24;
                const nextStartX = i + 1 < monthGroups.length ? monthGroups[i + 1].startX : WIDTH - PAD_RIGHT;
                return (
                    <g key={i}>
                        <line x1={g.startX} x2={nextStartX} y1={bracketY} y2={bracketY} stroke="#d1d5db" strokeWidth="1" />
                        {i + 1 < monthGroups.length && (
                            <line x1={nextStartX} x2={nextStartX} y1={bracketY} y2={bracketY - 4} stroke="#d1d5db" strokeWidth="1" />
                        )}
                        <text x={midX} y={bracketY + 14} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="600">
                            {g.month}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

export default AttendanceChart;
```

- [ ] **Step 2: Build**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -10
```

Očekávání: žádné chyby.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/advanced-stats/AttendanceChart.tsx
git commit -m "feat: add AttendanceChart SVG component"
```

---

## Task 6: Komponenta `TeamStatsTab.tsx`

**Files:**
- Create: `client/src/components/advanced-stats/TeamStatsTab.tsx`

- [ ] **Step 1: Vytvoř komponentu**

```tsx
import React, { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface Player {
    id: string;
    kind: string;
    name: string;
}
interface FreqEntry { players: Player[]; count: number; }
interface SuccEntry { players: Player[]; wins: number; total: number; winPct: number; }

interface TeamStatsData {
    pairsFrequency: FreqEntry[];
    pairsSuccess: SuccEntry[];
    triosFrequency: FreqEntry[];
    triosSuccess: SuccEntry[];
}

interface Props { data: TeamStatsData; }

const INITIAL_SHOW = 3;

const PlayerNames: React.FC<{ players: Player[] }> = ({ players }) => (
    <span>{players.map(p => p.name).join(' & ')}</span>
);

const FreqList: React.FC<{ items: FreqEntry[]; color: string }> = ({ items, color }) => {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visible.map((item, i) => (
                    <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px',
                        padding: '10px 14px'
                    }}>
                        <span style={{ color: '#111827', fontWeight: 500 }}><PlayerNames players={item.players} /></span>
                        <span style={{ fontWeight: 700, color, fontSize: '15px' }}>{item.count}×</span>
                    </div>
                ))}
            </div>
            {items.length > INITIAL_SHOW && (
                <button onClick={() => setExpanded(e => !e)} style={{
                    marginTop: '8px', background: 'none', border: 'none', color,
                    fontSize: '13px', cursor: 'pointer', padding: '4px 0', fontWeight: 500
                }}>
                    {expanded ? '▲ Skrýt' : `▼ ${t('showAll').replace('{n}', String(items.length))}`}
                </button>
            )}
        </div>
    );
};

const SuccTable: React.FC<{ items: SuccEntry[]; labelKey: string; color: string }> = ({ items, labelKey, color }) => {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? items : items.slice(0, INITIAL_SHOW);

    return (
        <div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                    <thead>
                        <tr style={{ background: '#f9fafb' }}>
                            <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{t(labelKey)}</th>
                            <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{t('colWins')}</th>
                            <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>{t('colWinPct')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((item, i) => (
                            <tr key={i} style={{ borderBottom: i < visible.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 500, color: '#111827' }}><PlayerNames players={item.players} /></td>
                                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{item.wins}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#10b981' }}>{item.winPct} %</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {items.length > INITIAL_SHOW && (
                <button onClick={() => setExpanded(e => !e)} style={{
                    marginTop: '8px', background: 'none', border: 'none', color,
                    fontSize: '13px', cursor: 'pointer', padding: '4px 0', fontWeight: 500
                }}>
                    {expanded ? '▲ Skrýt' : `▼ ${t('showAll').replace('{n}', String(items.length))}`}
                </button>
            )}
        </div>
    );
};

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
    <div style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
        {label}
    </div>
);

const TeamStatsTab: React.FC<Props> = ({ data }) => {
    const { t } = useLanguage();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
                <SectionTitle label={t('mostFreqPairs')} />
                <FreqList items={data.pairsFrequency} color="#3b82f6" />
            </div>
            <div>
                <SectionTitle label={t('mostSuccPairs')} />
                <SuccTable items={data.pairsSuccess} labelKey="colPair" color="#3b82f6" />
            </div>
            <div>
                <SectionTitle label={t('mostFreqTrios')} />
                <FreqList items={data.triosFrequency} color="#8b5cf6" />
            </div>
            <div>
                <SectionTitle label={t('mostSuccTrios')} />
                <SuccTable items={data.triosSuccess} labelKey="colTrio" color="#8b5cf6" />
            </div>
        </div>
    );
};

export default TeamStatsTab;
```

- [ ] **Step 2: Build**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/advanced-stats/TeamStatsTab.tsx
git commit -m "feat: add TeamStatsTab component"
```

---

## Task 7: Komponenta `AttendanceTab.tsx`

**Files:**
- Create: `client/src/components/advanced-stats/AttendanceTab.tsx`

- [ ] **Step 1: Vytvoř komponentu**

```tsx
import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import AttendanceChart from './AttendanceChart';

interface TimelinePoint { date: string; week: number; month: string; attendeeCount: number; }
interface PlayerCountEntry { count: number; terms: number; }
interface TeamCountEntry { teams: number; terms: number; }

interface AttendanceData {
    timeline: TimelinePoint[];
    byPlayerCount: PlayerCountEntry[];
    byTeamCount: TeamCountEntry[];
}

interface Props { data: AttendanceData; }

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
    <div style={{ fontSize: '13px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
        {label}
    </div>
);

const BarList: React.FC<{ items: { label: string; value: number }[]; color: string }> = ({ items, color }) => {
    const max = Math.max(...items.map(i => i.value), 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '10px 14px' }}>
                    <span style={{ fontWeight: 600, color: '#111827', minWidth: '70px' }}>{item.label}</span>
                    <div style={{ flex: 1, background: '#e5e7eb', borderRadius: '4px', height: '10px', overflow: 'hidden' }}>
                        <div style={{ width: `${(item.value / max) * 100}%`, background: color, height: '100%', borderRadius: '4px' }} />
                    </div>
                    <span style={{ fontWeight: 700, color, minWidth: '32px', textAlign: 'right' }}>{item.value}×</span>
                </div>
            ))}
        </div>
    );
};

const AttendanceTab: React.FC<Props> = ({ data }) => {
    const { t } = useLanguage();

    const playerItems = data.byPlayerCount.map(e => ({
        label: `${e.count} ${t('players')}`,
        value: e.terms
    }));

    const teamItems = data.byTeamCount.map(e => ({
        label: `${e.teams} ${t('teams')}`,
        value: e.terms
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div>
                <SectionTitle label={t('attendanceChart')} />
                <AttendanceChart timeline={data.timeline} />
            </div>
            <div>
                <SectionTitle label={t('attendanceByPlayers')} />
                {playerItems.length === 0
                    ? <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>{t('noDataYet')}</p>
                    : <BarList items={playerItems} color="#3b82f6" />
                }
            </div>
            {data.byTeamCount.length > 0 && (
                <div>
                    <SectionTitle label={t('attendanceByTeams')} />
                    <BarList items={teamItems} color="#8b5cf6" />
                </div>
            )}
        </div>
    );
};

export default AttendanceTab;
```

- [ ] **Step 2: Build**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/advanced-stats/AttendanceTab.tsx
git commit -m "feat: add AttendanceTab component"
```

---

## Task 8: Stránka `AdvancedStatsPage.tsx`

**Files:**
- Create: `client/src/pages/AdvancedStatsPage.tsx`

- [ ] **Step 1: Vytvoř stránku**

```tsx
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import api from '../services/api';
import TeamStatsTab from '../components/advanced-stats/TeamStatsTab';
import AttendanceTab from '../components/advanced-stats/AttendanceTab';

type TabKey = 'team' | 'attendance';

interface TabDef {
    key: TabKey;
    labelKey: string;
    teamSportOnly: boolean;
}

const TABS: TabDef[] = [
    { key: 'team',       labelKey: 'teamStats',      teamSportOnly: true },
    { key: 'attendance', labelKey: 'attendanceTab',  teamSportOnly: false },
];

const AdvancedStatsPage: React.FC = () => {
    const { uuid } = useParams<{ uuid: string }>();
    const { t, language } = useLanguage();

    const [activityType, setActivityType] = useState<string | null>(null);
    const [eventName, setEventName] = useState<string>('');
    const [eventLoaded, setEventLoaded] = useState(false);

    const [activeTab, setActiveTab] = useState<TabKey | null>(null);
    const [tabData, setTabData] = useState<Record<string, any>>({});
    const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
    const [tabError, setTabError] = useState<Record<string, string>>({});

    // Načti základní info o eventu jednou
    React.useEffect(() => {
        if (!uuid) return;
        api.get(`/events/uuid/${uuid}`).then(({ data }) => {
            setActivityType(data.activityType || null);
            setEventName(data.name || '');
            setEventLoaded(true);
            // Vyber první dostupný tab
            const firstTab = data.activityType === 'TEAM_SPORT' ? 'team' : 'attendance';
            setActiveTab(firstTab as TabKey);
            fetchTab(firstTab as TabKey, data.activityType);
        });
    }, [uuid]);

    const fetchTab = async (tab: TabKey, overrideActivity?: string) => {
        const activity = overrideActivity ?? activityType;
        if (tab === 'team' && activity !== 'TEAM_SPORT') return;
        if (tabData[tab] || tabLoading[tab]) return;

        setTabLoading(prev => ({ ...prev, [tab]: true }));
        try {
            const endpoint = tab === 'team'
                ? `/events/uuid/${uuid}/advanced-stats/team`
                : `/events/uuid/${uuid}/advanced-stats/attendance?lang=${language}`;
            const { data } = await api.get(endpoint);
            setTabData(prev => ({ ...prev, [tab]: data }));
        } catch (e: any) {
            setTabError(prev => ({ ...prev, [tab]: e.response?.data?.message || 'Error' }));
        } finally {
            setTabLoading(prev => ({ ...prev, [tab]: false }));
        }
    };

    const handleTabClick = (tab: TabKey) => {
        setActiveTab(tab);
        fetchTab(tab);
    };

    const visibleTabs = TABS.filter(tab =>
        !tab.teamSportOnly || activityType === 'TEAM_SPORT'
    );

    const tabStyle = (key: TabKey): React.CSSProperties => ({
        padding: '10px 20px',
        border: 'none',
        background: 'none',
        fontSize: '14px',
        fontWeight: activeTab === key ? 600 : 500,
        color: activeTab === key ? '#3b82f6' : '#6b7280',
        borderBottom: activeTab === key ? '2px solid #3b82f6' : 'none',
        marginBottom: activeTab === key ? '-2px' : '0',
        cursor: 'pointer',
    });

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
                <Link to={`/event/${uuid}`} style={{ color: '#6b7280', display: 'flex', alignItems: 'center' }}>
                    <ArrowLeft size={18} />
                </Link>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1f2937' }}>
                    {t('advancedStats')}{eventName ? ` — ${eventName}` : ''}
                </h2>
            </div>

            {!eventLoaded ? (
                <p style={{ color: '#9ca3af' }}>{t('loading')}</p>
            ) : (
                <>
                    <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: '20px' }}>
                        {visibleTabs.map(tab => (
                            <button key={tab.key} onClick={() => handleTabClick(tab.key)} style={tabStyle(tab.key)}>
                                {t(tab.labelKey)}
                            </button>
                        ))}
                    </div>

                    {activeTab && (
                        <div>
                            {tabLoading[activeTab] && <p style={{ color: '#9ca3af' }}>{t('loading')}</p>}
                            {tabError[activeTab] && <p style={{ color: '#ef4444' }}>{tabError[activeTab]}</p>}
                            {!tabLoading[activeTab] && !tabError[activeTab] && tabData[activeTab] && (
                                <>
                                    {activeTab === 'team' && <TeamStatsTab data={tabData['team']} />}
                                    {activeTab === 'attendance' && <AttendanceTab data={tabData['attendance']} />}
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AdvancedStatsPage;
```

- [ ] **Step 2: Build**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/AdvancedStatsPage.tsx
git commit -m "feat: add AdvancedStatsPage with lazy-loading tabs"
```

---

## Task 9: Route v App.tsx + ikona v EventDetailPage

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/EventDetailPage.tsx`

- [ ] **Step 1: Přidej route v App.tsx**

Najdi řádek:
```tsx
import EventDetailPage from './pages/EventDetailPage';
```
Za něj přidej:
```tsx
import AdvancedStatsPage from './pages/AdvancedStatsPage';
```

Najdi:
```tsx
<Route path="/event/:uuid" element={<EventDetailPage />} />
```
Za něj přidej:
```tsx
<Route path="/event/:uuid/advanced-stats" element={<AdvancedStatsPage />} />
```

- [ ] **Step 2: Přidej ikonu do EventDetailPage**

V `EventDetailPage.tsx` najdi import lucide-react (je tam `Trophy`, `Trash2`, atd.) a přidej `BarChart2` a `Link` z react-router-dom (pokud `Link` ještě není importovaný — zkontroluj, možná tam je jen `useNavigate`).

```tsx
import { BarChart2 } from 'lucide-react';
import { Link } from 'react-router-dom';
```

Najdi h2 nadpis Statistiky v JSX (cca řádek 846):
```tsx
<h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
    {t('statistics')}{' '}
```

Přidej ikonu jako `<Link>` hned za uzavírací `</h2>` tag (ale uvnitř `div` který je flex kontejnerem):

```tsx
<Link
    to={`/event/${uuid}/advanced-stats`}
    title={t('advancedStats')}
    style={{ color: '#6b7280', display: 'flex', alignItems: 'center', marginLeft: '8px' }}
>
    <BarChart2 size={20} />
</Link>
```

- [ ] **Step 3: Build**

```bash
cd /Users/koudelka/Koudelka/orgie/client && npm run build 2>&1 | tail -10
```

Očekávání: build projde bez chyb.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx client/src/pages/EventDetailPage.tsx
git commit -m "feat: wire up advanced-stats route and nav icon"
```

---

## Self-review

**Spec coverage:**
- ✅ Nová stránka `/event/:uuid/advanced-stats` — Task 8+9
- ✅ Ikona vedle nadpisu Statistiky — Task 9
- ✅ Tab Týmové stats (jen TEAM_SPORT) — Task 2+6+8
- ✅ Nejčastější dvojice/trojice top 3 + rozbalit — Task 6
- ✅ Nejúspěšnější dvojice/trojice s výhrami a % — Task 2+6
- ✅ Tab Účast lazy loading — Task 8
- ✅ Graf vývoje účasti (smooth cubic bezier, měsíce na ose) — Task 5+7
- ✅ Termíny podle počtu hráčů — Task 3+7
- ✅ Termíny podle počtu týmů — Task 3+7
- ✅ Lokalizace cs/en — Task 4
- ✅ Rozšiřitelnost tabů — Task 8 (pole TABS)

**Placeholder scan:** Žádné TBD, žádné "handle edge cases" bez kódu. ✅

**Type consistency:** `FreqEntry`, `SuccEntry`, `TimelinePoint`, `PlayerCountEntry`, `TeamCountEntry` použity konzistentně napříč Task 5–8. `AttendanceData` v Task 7 přijímá stejný tvar jako response z Task 3. ✅
