# Pokročilé statistiky — Design spec

## Přehled

Nová stránka `/event/:uuid/advanced-stats` přístupná přes ikonu vedle nadpisu „Statistiky" v `EventDetailPage`. Zobrazuje pokročilé statistiky s tab navigací a lazy loadingem dat per tab. Přístupná všem přihlášeným uživatelům stejně jako stávající statistiky.

## Navigace

V `EventDetailPage.tsx`, vedle nadpisu „Statistiky" (h2), přibude ikona `BarChart2` (lucide-react) jako `<Link>` navigující na `/event/:uuid/advanced-stats`. Stávající layout nadpisu se nezmění — ikona se přidá do stejného flex kontejneru.

## Stránka `AdvancedStatsPage.tsx`

Nová stránka s tab navigací. Každý tab načítá data lazy — fetch se spustí při prvním kliknutí na záložku, výsledek se cachuje v lokálním state. Opakované přepínání tabs neposílá nové requesty.

### Routing

`App.tsx` dostane novou routu: `/event/:uuid/advanced-stats` → `<AdvancedStatsPage />`.

Stránka si přečte `uuid` z URL params a načte základní info o eventu (název, `activityType`) pro podmíněné zobrazení záložek.

---

## Tab 1: Týmové stats

Zobrazí se pouze pro eventy s `activityType === 'TEAM_SPORT'`. Pokud event není týmový sport, tab se nezobrazí vůbec.

**Backend endpoint:** `GET /events/uuid/:uuid/advanced-stats/team`

Výpočet probíhá nad archivovanými termíny, které mají vyplněné `statistics.teams`. Pro každý termín se iteruje přes všechny týmy a jejich členy:

- **Frekvence dvojice/trojice:** Počet termínů, ve kterých se daná kombinace hráčů vyskytla ve stejném týmu.
- **Úspěšnost dvojice/trojice:** Počet výher týmu, ve kterém kombinace hrála. Výhra = tým měl nejvíce výher (nebo remíza při shodě). Procento = výhry / celkový počet termínů kombinace.

Response:
```json
{
  "pairsFrequency": [{ "players": [...], "count": 23 }],
  "pairsSuccess":   [{ "players": [...], "wins": 18, "winPct": 78.3 }],
  "triosFrequency": [{ "players": [...], "count": 14 }],
  "triosSuccess":   [{ "players": [...], "wins": 11, "winPct": 79.0 }]
}
```

Všechna pole vrácena seřazena sestupně (podle `count` resp. `winPct`).

### UI — 4 sekce

**Nejčastější dvojice** a **Nejčastější trojice:** seznam řádků `jméno A & jméno B — N×`. Výchozí pohled: top 3. Tlačítko „Zobrazit všechny (N)" rozbalí zbytek; tlačítko „Skrýt" seznam sbalí.

**Nejúspěšnější dvojice** a **Nejúspěšnější trojice:** tabulka se sloupci: `Dvojice/Trojice | Výhry | % výher`. Řazena podle `% výher` sestupně. Výchozí pohled: top 3 + rozbalit.

---

## Tab 2: Účast

**Backend endpoint:** `GET /events/uuid/:uuid/advanced-stats/attendance`

Response:
```json
{
  "timeline": [
    { "date": "2025-10-03", "week": 1, "month": "říjen", "attendeeCount": 7 }
  ],
  "byPlayerCount": [{ "count": 7, "terms": 12 }],
  "byTeamCount":   [{ "teams": 2, "terms": 38 }]
}
```

`timeline` je seřazen chronologicky. `month` je lokalizovaný název měsíce (dle jazyka uživatele).

### UI — 3 sekce

**Graf vývoje účasti:**
- SVG čárový graf vykreslený ručně (bez externí knihovny).
- Křivka: cubic bezier spline (zaoblené přechody).
- Osa X: čísla týdnů (T1, T2, …) s měsíčními závorkami pod nimi — linka oddělující měsíce + název měsíce.
- Osa Y: počet hráčů (min–max z dat, zaokrouhleno na celá čísla).
- Žlutá přerušovaná linie = průměrná účast v sezoně, s popiskem „prům. X,X".
- Body na křivce: malé kroužky (fill white, stroke blue).
- Plocha pod křivkou: modrá s 10% opacity.

**Termíny podle počtu hráčů:**
Řádky pro každý unikátní počet hráčů (od minima do maxima v datech). Každý řádek: popisek počtu + progress bar + číslo termínů. Bar je relativní k nejvyšší hodnotě.

**Termíny podle počtu týmů:**
Stejná struktura jako výše, ale pro počet týmů (2, 3, …).

---

## Rozšiřitelnost

Každý nový tab = nová React komponenta + nový backend endpoint. Stávající taby a jejich endpointy se nedotýkají. Tab bar je pole definic `{ key, label, component }`, nový tab se přidá jedním záznamem.

---

## Lokalizace

Všechny nové texty (popisky sekcí, tlačítka, tooltip průměru) se přidají do `LanguageContext.tsx` jako dvojice `cs`/`en`.

## Co se nemění

- Stávající stats sekce v `EventDetailPage` zůstává beze změny.
- `TermStatsModal` se nedotýká.
- Existující endpoint `/events/uuid/:uuid/stats` zůstává.
