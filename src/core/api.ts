import { useAuthStore } from '../store/authStore.ts';

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
      useAuthStore.getState().setAuth(user, data.accessToken);
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
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };
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

    if ((response.status === 401 || response.status === 403) && !logoutGuard) {
      // Parse response body to distinguish auth failures from business logic 403s
      let errorBody: any = null;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          errorBody = await response.clone().json();
        }
      } catch { /* ignore */ }

      // Business logic 403 (RBAC, permissions) — do NOT refresh, throw immediately
      const isBusinessForbidden = response.status === 403 && (
        errorBody?.message?.includes('Insufficient permissions') ||
        errorBody?.message?.includes('permission') ||
        errorBody?.code === 'RESOLUTION_DETAILS_REQUIRED' ||
        errorBody?.code === 'INVALID_TRANSITION' ||
        errorBody?.code === 'ASSIGNMENT_REQUIRED' ||
        errorBody?.code === 'ISSUE_TYPE_REQUIRED' ||
        errorBody?.code === 'REOPEN_FORBIDDEN'
      );

      if (isBusinessForbidden) {
        throw new ApiError(403, errorBody?.code || 'FORBIDDEN', errorBody?.message || 'Forbidden');
      }

      // Auth-related 401/403 — try token refresh ONCE
      const newToken = await tryRefreshToken();
      if (newToken) {
        response = await executeFetch(url, options, newToken);
      } else {
        logoutGuard = true;
        useAuthStore.getState().logout();
        broadcastChannel?.postMessage({ type: 'logout' });
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        setTimeout(() => { logoutGuard = false; }, 2000);
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
      return await response.json();
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

