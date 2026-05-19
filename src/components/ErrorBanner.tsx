import { useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore.ts';

interface ErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  maxRetries?: number;
}

export default function ErrorBanner({ error, onRetry, onDismiss, maxRetries = 3 }: ErrorBannerProps) {
  const [retryCount, setRetryCount] = useState(0);
  const logout = useAuthStore((state) => state.logout);

  const limited = onRetry && retryCount >= maxRetries;

  const handleRetry = useCallback(() => {
    if (onRetry && !limited) {
      setRetryCount((c) => c + 1);
      onRetry();
    }
  }, [onRetry, limited]);

  const handleLogout = useCallback(() => {
    logout();
    window.dispatchEvent(new CustomEvent('navigate', { detail: '/login' }));
  }, [logout]);

  if (!error) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 p-4 rounded-2xl bg-danger-red/5 border border-danger-red/10 text-danger-red"
    >
      <AlertTriangle size={20} className="shrink-0" />
      <span className="text-sm font-bold flex-1">
        {limited
          ? 'System authentication temporary mismatch. Please log out and log back in.'
          : error}
      </span>
      {limited ? (
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-bold underline hover:no-underline"
        >
          <LogOut size={14} />
          Log Out
        </button>
      ) : (
        <>
          {onRetry && (
            <button onClick={handleRetry} className="flex items-center gap-1.5 text-xs font-bold underline hover:no-underline">
              <RefreshCw size={14} />
              Retry
            </button>
          )}
          {onDismiss && (
            <button onClick={onDismiss} className="text-danger-red/60 hover:text-danger-red text-lg leading-none">&times;</button>
          )}
        </>
      )}
    </motion.div>
  );
}
