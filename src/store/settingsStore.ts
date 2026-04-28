import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  language: 'ar' | 'en';
  theme: 'light' | 'dark';
  setLanguage: (lang: 'ar' | 'en') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  toggleLanguage: () => void;
  toggleTheme: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'ar',
      theme: 'light',
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      toggleLanguage: () => set((state) => ({ language: state.language === 'ar' ? 'en' : 'ar' })),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'abc-settings-storage',
    }
  )
);
