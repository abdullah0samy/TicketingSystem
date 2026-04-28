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
  logout: async () => {
    try {
      // Use standard fetch here or dynamic import to avoid circular dependency with apiFetch
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch(e) {}
    localStorage.removeItem('accessToken');
    // NOTE: We intentionally preserve 'abc-settings-storage' (theme, language) so
    // dark mode and language preferences survive logout/login cycles.
    set({ user: null, accessToken: null });
  },
}));
