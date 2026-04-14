# Session Expiry UX — Design Spec

**Date:** 2026-04-14  
**Status:** Approved

## Problem

Users report signing up for events when they in fact did not. Root cause: when both the access token and refresh token expire while the page is open, any mutation (e.g. attendance toggle) fails silently or with a cryptic error. The axios interceptor attempts a token refresh, which also fails, and propagates `refreshError` — but the error toast message ("Failed to update attendance") gives no indication that the session expired or that the user needs to log in again. Additionally, `AuthContext.user` remains set, so the UI still appears fully authenticated.

## Goals

- When a session expires (refresh fails), clearly communicate to the user that they need to log in again.
- Do not automatically redirect — show an actionable toast with a login link.
- Silently clear the authenticated user state so the UI reflects reality.
- No changes required to individual page handlers (`EventDetailPage`, `TermAttendanceMatrix`, etc.).

## Architecture

### Data flow

```
api.ts interceptor
  └─ refresh request fails
       ├─ onSessionExpired?.()         ← registered singleton callback
       └─ Promise.reject(refreshError)

App.tsx (on mount)
  └─ setSessionExpiredHandler(() =>
         showActionToast('Tvoje session vypršela.', 'error', { label: 'Přihlásit se', href: '/login' })
     )

AuthContext
  └─ listens for 'session-expired' window event
       └─ setUser(null)                ← clears authenticated state
```

### Why a singleton callback instead of a window event for the toast

`api.ts` is a plain module outside the React tree and cannot use `useToast()` directly. A singleton callback (`setSessionExpiredHandler`) lets `App.tsx` wire up the React context after mount, keeping `api.ts` framework-agnostic. The `AuthContext` uses a window event instead because it does not need to call React context — it only updates its own state.

## Changes

### 1. `client/src/services/api.ts`

Add a singleton session-expired handler and call it when the refresh request fails:

```ts
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void) => {
    onSessionExpired = fn;
};
```

In the response interceptor's catch block, before `Promise.reject(refreshError)`:

```ts
onSessionExpired?.();
window.dispatchEvent(new Event('session-expired'));
return Promise.reject(refreshError);
```

### 2. `client/src/context/ToastContext.tsx`

Extend `Toast` with an optional `action` field and add `showActionToast`:

```ts
interface Toast {
    id: string;
    message: string;
    type: ToastType;
    action?: { label: string; href: string };
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    showActionToast: (message: string, type: ToastType, action: { label: string; href: string }) => void;
}
```

- Action toasts use a timeout of 8 seconds (vs. 4 seconds for standard toasts).
- The toast renders an `<a>` link button to the right of the message, before the dismiss (×) button.
- Clicking the link closes the toast and navigates to the href.

Visual layout:

```
┌──────────────────────────────────────────────────────┐
│ ⚠  Tvoje session vypršela.   [Přihlásit se]   ×     │
└──────────────────────────────────────────────────────┘
```

### 3. `client/src/context/AuthContext.tsx`

Listen for the `session-expired` window event and clear the user:

```ts
useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener('session-expired', handleExpired);
    return () => window.removeEventListener('session-expired', handleExpired);
}, []);
```

### 4. `client/src/App.tsx`

Register the session-expired handler after mount:

```ts
const { showActionToast } = useToast();

useEffect(() => {
    setSessionExpiredHandler(() =>
        showActionToast(
            'Tvoje session vypršela.',
            'error',
            { label: 'Přihlásit se', href: '/login' }
        )
    );
}, [showActionToast]);
```

## What does NOT change

- `EventDetailPage.tsx` — `handleAttendanceToggle` and `handleToggleEventAttendance` are unchanged.
- `TermAttendanceMatrix.tsx` — no changes.
- Server-side code — no changes.
- Login/register flows — no changes.

## Error message strings

| Key | Czech | English |
|-----|-------|---------|
| `sessionExpired` | Tvoje session vypršela. | Your session has expired. |
| `login` (existing) | Přihlásit se | Log in |

The message should use the existing `t('login')` translation key for the button label.

## Testing

- Open the app, let the session expire (or manually clear cookies), then click an attendance checkbox.
- Expected: action toast appears with "Tvoje session vypršela." and a "Přihlásit se" link. The navbar switches to unauthenticated state. No automatic redirect occurs.
- Clicking "Přihlásit se" navigates to `/login` and the toast disappears.
