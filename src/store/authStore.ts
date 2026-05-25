import { create } from 'zustand';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  csrfToken: string | null;
  setAuth: (user: any, accessToken: string, csrfToken?: string) => void;
  setCsrfToken: (token: string) => void;
  logout: () => void;
}

const persistedToken = typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') : null;

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: persistedToken,
  csrfToken: null,
  setAuth: (user, accessToken, csrfToken?: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('accessToken', accessToken);
    }
    set({ user, accessToken, csrfToken: csrfToken ?? null });
  },
  setCsrfToken: (csrfToken) => {
    set({ csrfToken });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('accessToken');
    }
    set({ user: null, accessToken: null, csrfToken: null });
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  },
}));
