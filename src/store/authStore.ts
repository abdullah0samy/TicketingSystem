import { create } from 'zustand';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  setAuth: (user: any, accessToken: string) => void;
  logout: () => void;
}

const persistedToken = typeof window !== 'undefined' ? sessionStorage.getItem('accessToken') : null;
const persistedUser = typeof window !== 'undefined' && sessionStorage.getItem('user')
  ? JSON.parse(sessionStorage.getItem('user')!) : null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: persistedUser,
  accessToken: persistedToken,
  setAuth: (user, accessToken) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('user', JSON.stringify(user));
    }
    set({ user, accessToken });
  },
  logout: async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('user');
    }
    set({ user: null, accessToken: null });
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore — server may be unreachable
    }
  },
}));
