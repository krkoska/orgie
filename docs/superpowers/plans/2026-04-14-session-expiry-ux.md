# Session Expiry UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When both access and refresh tokens expire while the page is open, show a clear action toast ("Tvoje session vypršela." + "Přihlásit se" link) and silently clear the authenticated user state.

**Architecture:** The axios interceptor in `api.ts` detects a failed refresh and fires a singleton callback + a window event. `AuthContext` clears `user` via the window event. `AppRoutes` (inside `ToastProvider`) registers the singleton callback on mount to show an action toast. No changes to individual page handlers.

**Tech Stack:** React 19, axios, TypeScript, Vite — no test framework present, verification is via `tsc --noEmit` + manual browser testing.

---

## File Map

| File | Change |
|------|--------|
| `client/src/context/LanguageContext.tsx` | Add `sessionExpired` translation key |
| `client/src/context/ToastContext.tsx` | Add `action` field to Toast, add `showActionToast` |
| `client/src/services/api.ts` | Export `setSessionExpiredHandler`, call it + dispatch window event on refresh failure |
| `client/src/context/AuthContext.tsx` | Listen for `session-expired` window event, call `setUser(null)` |
| `client/src/App.tsx` | Import `useToast`, `useLanguage`, `setSessionExpiredHandler` in `AppRoutes`; register handler on mount |

---

### Task 1: Add `sessionExpired` translation key

**Files:**
- Modify: `client/src/context/LanguageContext.tsx`

- [ ] **Step 1: Add the translation key**

In `client/src/context/LanguageContext.tsx`, find the `// Auth & Nav` section (around line 13) and add after the `'passwordResetSuccess'` entry or at the end of the auth section:

```ts
'sessionExpired': { en: 'Your session has expired.', cs: 'Tvoje session vypršela.' },
```

The relevant area looks like this — add the new key right after `'login'`:

```ts
const translations: Translations = {
    // Auth & Nav
    'login': { en: 'Login', cs: 'Přihlásit se' },
    'sessionExpired': { en: 'Your session has expired.', cs: 'Tvoje session vypršela.' },  // ← add this line
    'register': { en: 'Register', cs: 'Registrovat' },
    // ... rest unchanged
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/context/LanguageContext.tsx
git commit -m "feat: add sessionExpired translation key"
```

---

### Task 2: Extend ToastContext with action toast support

**Files:**
- Modify: `client/src/context/ToastContext.tsx`

- [ ] **Step 1: Update the `Toast` interface and `ToastContextType`**

Replace the existing interfaces at the top of the file:

```ts
type ToastType = 'success' | 'error' | 'info';

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

- [ ] **Step 2: Add `showActionToast` implementation**

In the `ToastProvider` component body, after the existing `showToast` function, add:

```ts
const showActionToast = useCallback((message: string, type: ToastType, action: { label: string; href: string }) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type, action };
    setToasts(prev => [...prev, newToast]);
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, 8000);
}, []);
```

- [ ] **Step 3: Expose `showActionToast` in context value**

Update the `ToastContext.Provider` value prop:

```tsx
<ToastContext.Provider value={{ showToast, showActionToast }}>
```

- [ ] **Step 4: Render the action button in the toast JSX**

In the toast map inside the `return`, add the action link after the message `<div>` and before the dismiss `<button>`:

```tsx
{toast.action && (
    <a
        href={toast.action.href}
        style={{
            color: getColor(toast.type),
            fontWeight: 600,
            fontSize: '13px',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            border: `1px solid ${getColor(toast.type)}`,
            borderRadius: '4px',
        }}
    >
        {toast.action.label}
    </a>
)}
```

The full toast item JSX (inside the `toasts.map`) should look like:

```tsx
<div
    key={toast.id}
    style={{
        background: 'white',
        padding: '12px 16px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minWidth: '300px',
        maxWidth: '500px',
        borderLeft: `4px solid ${getColor(toast.type)}`,
        animation: 'slideIn 0.3s ease-out'
    }}
>
    <div style={{ color: getColor(toast.type), display: 'flex' }}>
        {getIcon(toast.type)}
    </div>
    <div style={{ flex: 1, fontSize: '14px', color: '#333' }}>
        {toast.message}
    </div>
    {toast.action && (
        <a
            href={toast.action.href}
            style={{
                color: getColor(toast.type),
                fontWeight: 600,
                fontSize: '13px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                padding: '4px 8px',
                border: `1px solid ${getColor(toast.type)}`,
                borderRadius: '4px',
            }}
        >
            {toast.action.label}
        </a>
    )}
    <button
        onClick={() => removeToast(toast.id)}
        style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            color: '#666'
        }}
    >
        <X size={16} />
    </button>
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/context/ToastContext.tsx
git commit -m "feat: add action toast support to ToastContext"
```

---

### Task 3: Update `api.ts` to detect refresh failure

**Files:**
- Modify: `client/src/services/api.ts`

- [ ] **Step 1: Add the singleton handler export**

At the top of `client/src/services/api.ts`, after the `import axios` line, add:

```ts
let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void): void => {
    onSessionExpired = fn;
};
```

- [ ] **Step 2: Fire the handler and window event on refresh failure**

In the response interceptor's `catch (refreshError)` block, replace:

```ts
// If refresh fails, let the error propagate
return Promise.reject(refreshError);
```

with:

```ts
// If refresh fails, notify the app that the session has expired
onSessionExpired?.();
window.dispatchEvent(new Event('session-expired'));
return Promise.reject(refreshError);
```

The complete `api.ts` should now look like:

```ts
import axios from 'axios';

let onSessionExpired: (() => void) | null = null;
export const setSessionExpiredHandler = (fn: () => void): void => {
    onSessionExpired = fn;
};

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api'),
    withCredentials: true
});

// Response interceptor for handling token expiration
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If error is 401 and we haven't retried yet
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/login')) {
            originalRequest._retry = true;

            try {
                // Attempt to refresh the token using the refresh endpoint
                await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, { withCredentials: true });

                // If refresh succeeds, retry the original request
                return api(originalRequest);
            } catch (refreshError) {
                // If refresh fails, notify the app that the session has expired
                onSessionExpired?.();
                window.dispatchEvent(new Event('session-expired'));
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/services/api.ts
git commit -m "feat: fire session-expired event when refresh token fails"
```

---

### Task 4: Update `AuthContext` to listen for session expiry

**Files:**
- Modify: `client/src/context/AuthContext.tsx`

- [ ] **Step 1: Add window event listener in `AuthProvider`**

In `client/src/context/AuthContext.tsx`, inside the `AuthProvider` component, add a new `useEffect` after the existing `checkUser` effect:

```ts
useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener('session-expired', handleExpired);
    return () => window.removeEventListener('session-expired', handleExpired);
}, []);
```

The full `AuthProvider` body should look like:

```tsx
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUser = async () => {
            try {
                const { data } = await api.get('/auth/me');
                setUser(data);
            } catch (error) {
                setUser(null);
            }
            setLoading(false);
        };
        checkUser();
    }, []);

    useEffect(() => {
        const handleExpired = () => setUser(null);
        window.addEventListener('session-expired', handleExpired);
        return () => window.removeEventListener('session-expired', handleExpired);
    }, []);

    const login = (userData: User) => {
        setUser(userData);
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            console.error('Logout failed', error);
        } finally {
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/context/AuthContext.tsx
git commit -m "feat: clear user on session-expired window event"
```

---

### Task 5: Register session-expired handler in `App.tsx`

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add imports**

At the top of `client/src/App.tsx`, add the missing imports. The import block should become:

```ts
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { useLanguage } from './context/LanguageContext';
import { setSessionExpiredHandler } from './services/api';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import EventDetailPage from './pages/EventDetailPage';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PollPage from './pages/PollPage';
```

Note: the existing `import { LanguageProvider } from './context/LanguageContext'` at line 48 stays — it is a separate named export. Add `useLanguage` to that import instead of duplicating:

```ts
import { LanguageProvider, useLanguage } from './context/LanguageContext';
```

And move it to the top with the other imports (remove the stray import at line 48).

- [ ] **Step 2: Register the handler inside `AppRoutes`**

`AppRoutes` is rendered inside both `ToastProvider` and `LanguageProvider`, so it can call `useToast()` and `useLanguage()`. Update `AppRoutes`:

```tsx
const AppRoutes: React.FC = () => {
  const { showActionToast } = useToast();
  const { t } = useLanguage();

  useEffect(() => {
    setSessionExpiredHandler(() =>
      showActionToast(t('sessionExpired'), 'error', { label: t('login'), href: '/login' })
    );
  }, [showActionToast, t]);

  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />
          <Route path="/event/:uuid" element={<EventDetailPage />} />
          <Route path="/poll/:uuid" element={<PollPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
        </Routes>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: register session-expired toast handler in AppRoutes"
```

---

### Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
cd client && npm run dev
```

- [ ] **Step 2: Simulate expired session**

Log in, then open DevTools → Application → Cookies and delete all cookies (or wait for real expiry). Keep the page open on an event detail page.

- [ ] **Step 3: Click an attendance checkbox**

Expected:
- Error toast appears: "Tvoje session vypršela." (or "Your session has expired." in English) with a red "Přihlásit se" button
- Toast stays visible for ~8 seconds
- The navbar switches to the unauthenticated state (no user name shown)
- No automatic redirect occurs

- [ ] **Step 4: Click "Přihlásit se" in the toast**

Expected: navigates to `/login`.

- [ ] **Step 5: Final commit if any tweaks were needed**

```bash
git add -p
git commit -m "fix: adjust session expiry UX based on manual testing"
```
