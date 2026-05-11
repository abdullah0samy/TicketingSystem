import { create } from 'zustand';

interface AuthState {
  user: any | null;
  accessToken: string | null;
  setAuth: (user: any, accessToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  setAuth: (user, accessToken) => {
    localStorage.setItem('accessToken', accessToken);
    set({ user, accessToken });
  },
  logout: () => {
    localStorage.removeItem('accessToken');
    set({ user: null, accessToken: null });
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
  },
}));
