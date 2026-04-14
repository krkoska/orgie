import axios from 'axios';

let onSessionExpired: (() => void) | null = null;
let sessionExpiredFired = false;

export const setSessionExpiredHandler = (fn: () => void): void => {
    onSessionExpired = fn;
    sessionExpiredFired = false; // reset when a new handler is registered (re-auth clears the flag)
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
                // If refresh fails, notify the app that the session has expired (once only)
                if (!sessionExpiredFired) {
                    sessionExpiredFired = true;
                    onSessionExpired?.();
                    window.dispatchEvent(new Event('session-expired'));
                }
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

export default api;
