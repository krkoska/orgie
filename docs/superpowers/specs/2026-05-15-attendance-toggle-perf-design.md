# Attendance Toggle Performance — Design Spec

**Date:** 2026-05-15  
**Status:** Approved

## Problem

Every checkbox click on the event detail page makes 2+ sequential API calls:
1. `POST /events/terms/:termId/attendance` — the toggle (returns populated updated term)
2. `GET /events/uuid/:uuid` — full event + per-term populate for all active terms

The second call is redundant: both toggle endpoints already return enough data to update local state directly. On Azure free tier, each round trip adds 500ms–2s of latency.

## Solution

Use toggle response payloads to patch React state directly. Remove `refreshData()` from both toggle handlers.

## Backend

### `toggleEventAttendance` — populate attendees in response

File: `server/src/controllers/eventController.ts`

Currently the response returns raw (unpopulated) attendees. Add a `.populate()` so the frontend can use the response to update state without a second fetch.

**Change** (around line 650 — the final fetch before `res.json`):
```typescript
// before
const updatedEvent = await Event.findById(event._id);
res.json({ attendees: updatedEvent?.attendees || [] });

// after
const updatedEvent = await Event.findById(event._id).populate({
    path: 'attendees.id',
    model: 'User',
    select: 'firstName lastName nickname preferNickname email'
});
res.json({ attendees: updatedEvent?.attendees || [] });
```

`toggleTermAttendance` already returns a fully populated term — no backend change needed there.

## Frontend

File: `client/src/pages/EventDetailPage.tsx`

### `handleAttendanceToggle`

Replace `refreshData()` with a targeted state patch using `data.term` from the response:

```typescript
const handleAttendanceToggle = async (termId: string, userId?: string, kind: 'USER' | 'GUEST' = 'USER') => {
    try {
        const { data } = await api.post(`/events/terms/${termId}/attendance`, { userId, kind });
        setTerms(prev => prev.map(t => t._id === data.term._id ? data.term : t));
        showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
    } catch (error: any) {
        showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
    }
};
```

### `handleToggleEventAttendance`

Replace `refreshData()` with a targeted state patch using `data.attendees` from the response:

```typescript
const handleToggleEventAttendance = async () => {
    if (!event) return;
    try {
        const { data } = await api.post(`/events/${event.uuid}/attendance`, {});
        setEvent(prev => prev ? { ...prev, attendees: data.attendees } : prev);
        showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
    } catch (error: any) {
        showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
    }
};
```

`refreshData()` remains in all other handlers (delete term, add guest, etc.).

## Files Changed

| File | Change |
|---|---|
| `server/src/controllers/eventController.ts` | Add `.populate()` to `toggleEventAttendance` response |
| `client/src/pages/EventDetailPage.tsx` | Patch state from toggle responses; remove `refreshData()` from both toggle handlers |

## Result

| Operation | Before | After |
|---|---|---|
| Term checkbox click | 2 round trips + N term populate queries | 1 round trip |
| Event attendance toggle | 2 round trips + N term populate queries | 1 round trip |
