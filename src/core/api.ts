import { useAuthStore } from '../store/authStore.ts';

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

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
  const { accessToken, logout } = useAuthStore.getState();

  try {
    let response = await executeFetch(url, options, accessToken);

    if ((response.status === 401 || response.status === 403) && !(window as any)._isLoggingOut) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        response = await executeFetch(url, options, newToken);
      } else {
        (window as any)._isLoggingOut = true;
        console.warn('Session expired. Logging out...');
        logout();
        window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
        setTimeout(() => { (window as any)._isLoggingOut = false; }, 2000);
        throw new Error('Session expired');
      }
    } else if (response.status === 401 || response.status === 403) {
      throw new Error('Session expired (logout in progress)');
    }

    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        throw {
          status: 'error',
          code: errorData.code || 'UNKNOWN_ERROR',
          message: errorData.message || 'API request failed',
          timestamp: new Date().toISOString(),
        };
      } else {
        const errorText = await response.text();
        throw {
          status: 'error',
          code: 'UNKNOWN_ERROR',
          message: `API request failed with status ${response.status}: ${errorText.substring(0, 100)}`,
          timestamp: new Date().toISOString(),
        };
      }
    }

    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Session expired') throw error;
    console.error(`API Fetch Error (${url}):`, error);
    if (error instanceof Error) {
      throw {
        status: 'error',
        code: 'FETCH_ERROR',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
    throw error;
  }
}

