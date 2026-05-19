import { create } from 'zustand';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  setAuth: (user: any, accessToken: string) => void;
  logout: () => void;
}

const persistedToken = typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') : null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: persistedToken,
  setAuth: (user, accessToken) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('accessToken', accessToken);
    }
    set({ user, accessToken });
  },
  logout: async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('accessToken');
    }
    set({ user: null, accessToken: null });
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore — server may be unreachable
    }
  },
}));
