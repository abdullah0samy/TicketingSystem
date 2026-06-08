import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore.ts';
import { LogIn, LifeBuoy, Globe, Moon, Sun, Eye, EyeOff } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore.ts';
import { translations } from '../core/translations.ts';
import { motion } from 'motion/react';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);
  const { language, theme, toggleLanguage, toggleTheme } = useSettingsStore();
  const t = translations[language];

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      setAuth(data.user, data.accessToken);
      window.dispatchEvent(new CustomEvent('navigate', { detail: '/dashboard' }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center bg-[var(--bg-main)] p-4 transition-colors duration-300 font-sans ${language === 'ar' ? 'rtl' : 'ltr'}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Theme & Language Toggles */}
      <div className="fixed top-6 right-6 flex items-center gap-3">
        <button 
          onClick={toggleTheme}
          className="p-3 bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-primary-blue transition-all"
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
        <button 
          onClick={toggleLanguage}
          className="p-3 bg-[var(--bg-surface)] rounded-2xl shadow-sm border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-primary-blue transition-all flex items-center gap-2 font-bold"
        >
          <Globe size={20} />
          <span className="text-xs uppercase">{language}</span>
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="premium-card p-10 relative overflow-hidden">
          {/* Decorative Elements */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-blue/5 rounded-full blur-3xl opacity-50" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-success-green/5 rounded-full blur-3xl opacity-50" />

          <div className="relative z-10">
            <div className="flex flex-col items-center mb-10 text-center">
              <div className="w-24 h-24 mb-6 drop-shadow-2xl">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-main)] mb-2 tracking-tight leading-tight">{t.loginTitle}</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">{t.loginSubTitle}</p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-6 p-4 bg-danger-red/10 border border-danger-red/20 text-danger-red rounded-2xl text-sm font-bold flex items-center gap-3"
              >
                <div className="w-2 h-2 bg-danger-red rounded-full animate-pulse" />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 ml-1">
                  {t.badgeNumber}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="input-surface w-full py-4 px-6 bg-[var(--border-dim)]"
                    placeholder="00000"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 ml-1">
                  {t.password}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-surface w-full py-4 px-6 pr-14 bg-[var(--border-dim)]"
                    placeholder={t.passwordPlaceholder}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-all p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-blue hover:bg-blue-700 text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-primary-blue/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {loading ? (
                  <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn size={20} />
                    {t.login}
                  </>
                )}
              </button>
            </form>

            <div className="mt-10 pt-8 border-t border-[var(--border-dim)] text-center">
              <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">
                {t.copyright}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
