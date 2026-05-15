# Attendance Toggle Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the redundant full-event refetch after checkbox clicks by patching React state directly from toggle response payloads.

**Architecture:** `toggleEventAttendance` gains a `.populate()` call so its response matches the shape expected by the frontend. Both toggle handlers on the frontend drop `refreshData()` and instead update only the affected slice of state using the data already returned by the toggle endpoint.

**Tech Stack:** Node.js/TypeScript/Express (backend), React/TypeScript (frontend)

---

## File map

| File | Change |
|---|---|
| `server/src/controllers/eventController.ts` | Add `.populate()` to the final fetch in `toggleEventAttendance` |
| `client/src/pages/EventDetailPage.tsx` | Replace `refreshData()` in both toggle handlers with targeted state patches |

---

## Task 1: Backend — populate attendees in `toggleEventAttendance` response

**Files:**
- Modify: `server/src/controllers/eventController.ts:650-651`

- [ ] **Step 1: Apply the change**

Find lines 650–651:
```typescript
        const updatedEvent = await Event.findById(event._id);
        res.json({ attendees: updatedEvent?.attendees || [] });
```

Replace with:
```typescript
        const updatedEvent = await Event.findById(event._id).populate({
            path: 'attendees.id',
            model: 'User',
            select: 'firstName lastName nickname preferNickname email'
        });
        res.json({ attendees: updatedEvent?.attendees || [] });
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd server && ./node_modules/.bin/tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/eventController.ts
git commit -m "fix: populate attendees in toggleEventAttendance response"
```

---

## Task 2: Frontend — patch state from toggle responses

**Files:**
- Modify: `client/src/pages/EventDetailPage.tsx:299-318`

- [ ] **Step 1: Replace `handleAttendanceToggle`**

Find lines 299–307:
```typescript
    const handleAttendanceToggle = async (termId: string, userId?: string, kind: 'USER' | 'GUEST' = 'USER') => {
        try {
            await api.post(`/events/terms/${termId}/attendance`, { userId, kind });
            await refreshData();
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };
```

Replace with:
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

- [ ] **Step 2: Replace `handleToggleEventAttendance`**

Find lines 309–318:
```typescript
    const handleToggleEventAttendance = async () => {
        if (!event) return;
        try {
            await api.post(`/events/${event.uuid}/attendance`, {});
            await refreshData();
            showToast(t('attendanceUpdated') || 'Attendance updated', 'success');
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Failed to update attendance', 'error');
        }
    };
```

Replace with:
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

- [ ] **Step 3: Build frontend to verify no errors**

```bash
cd client && npm run build
```

Expected: zero errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/EventDetailPage.tsx
git commit -m "perf: patch state from toggle responses, remove redundant refreshData calls"
```
