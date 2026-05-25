import { useAuthStore } from '../store/authStore.ts';

const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCsrfFromCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)x-csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

class ApiError extends Error {
  status: number;
  code: string;
  timestamp: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
let logoutGuard = false;

const broadcastChannel = typeof window !== 'undefined' ? new BroadcastChannel('auth_events') : null;

broadcastChannel?.addEventListener('message', (e) => {
  if (e.data?.type === 'logout') {
    useAuthStore.getState().logout();
  }
});

async function tryRefreshToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }
  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.accessToken) return null;
      const { user } = useAuthStore.getState();
      useAuthStore.getState().setAuth(user, data.accessToken, data.csrfToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function executeFetch(url: string, options: RequestInit, token: string | null): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const method = (options.method || 'GET').toUpperCase();

  const { csrfToken: storeToken, setCsrfToken } = useAuthStore.getState();
  const effectiveCsrf = storeToken || getCsrfFromCookie();
  if (!storeToken && effectiveCsrf) {
    setCsrfToken(effectiveCsrf);
  }

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (!CSRF_SAFE_METHODS.has(method) && effectiveCsrf) {
    headers['X-CSRF-Token'] = effectiveCsrf;
  }

  return fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  });
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  const { accessToken } = useAuthStore.getState();

  try {
    let response = await executeFetch(url, options, accessToken);

    // RATE LIMITED — throw immediately, NEVER trigger refresh or retry
    if (response.status === 429) {
      let errorBody: any = null;
      try {
        errorBody = await response.clone().json();
      } catch { /* ignore */ }
      throw new ApiError(429, errorBody?.code || 'RATE_LIMITED', errorBody?.message || 'Too many requests');
    }

    if ((response.status === 401 || response.status === 403) && !logoutGuard) {
      let errorBody: any = null;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorBody = await response.clone().json();
        }
      } catch { /* ignore */ }

      // Business logic 403 (RBAC) — code: FORBIDDEN from authorize middleware
      // Also catch other business-rule codes from ticket/kb/audit routes
      const isBusinessForbidden = (
        errorBody?.code === 'FORBIDDEN' ||
        errorBody?.code === 'RESOLUTION_DETAILS_REQUIRED' ||
        errorBody?.code === 'INVALID_TRANSITION' ||
        errorBody?.code === 'ASSIGNMENT_REQUIRED' ||
        errorBody?.code === 'ISSUE_TYPE_REQUIRED' ||
        errorBody?.code === 'REOPEN_FORBIDDEN' ||
        errorBody?.code === 'ACCOUNT_LOCKED'
      );

      if (isBusinessForbidden) {
        throw new ApiError(403, errorBody.code, errorBody.message || 'Forbidden');
      }

      // TOKEN_MISSING or TOKEN_INVALID — no point refreshing, logout immediately
      if (errorBody?.code === 'TOKEN_MISSING' || errorBody?.code === 'TOKEN_INVALID') {
        logoutGuard = true;
        useAuthStore.getState().logout();
        broadcastChannel?.postMessage({ type: 'logout' });
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        throw new ApiError(401, errorBody.code, errorBody.message || 'Invalid token');
      }

      // TOKEN_EXPIRED or generic 401/403 — try refresh ONCE
      const newToken = await tryRefreshToken();
      if (newToken) {
        response = await executeFetch(url, options, newToken);
      } else {
        logoutGuard = true;
        useAuthStore.getState().logout();
        broadcastChannel?.postMessage({ type: 'logout' });
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired');
      }
    } else if (response.status === 401 || response.status === 403) {
      throw new ApiError(401, 'LOGOUT_IN_PROGRESS', 'Session expired (logout in progress)');
    }

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw new ApiError(response.status, errorData.code || 'UNKNOWN_ERROR', errorData.message || 'API request failed');
      } else {
        const errorText = await response.text();
        throw new ApiError(response.status, 'UNKNOWN_ERROR', `API request failed with status ${response.status}: ${errorText.substring(0, 100)}`);
      }
    }

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      if (data.csrfToken) {
        useAuthStore.getState().setCsrfToken(data.csrfToken);
      }
      return data;
    }

    return response;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(`API Fetch Error (${url}):`, error);
    if (error instanceof Error) {
      throw new ApiError(0, 'FETCH_ERROR', error.message);
    }
    throw new ApiError(0, 'UNKNOWN_ERROR', 'An unknown error occurred');
  }
}
