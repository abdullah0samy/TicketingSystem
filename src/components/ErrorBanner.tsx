import { motion } from 'motion/react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 p-4 rounded-2xl bg-danger-red/5 border border-danger-red/10 text-danger-red"
    >
      <AlertTriangle size={20} className="shrink-0" />
      <span className="text-sm font-bold flex-1">{error}</span>
      {onRetry && (
        <button onClick={onRetry} className="flex items-center gap-1.5 text-xs font-bold underline hover:no-underline">
          <RefreshCw size={14} />
          Retry
        </button>
      )}
      {onDismiss && (
        <button onClick={onDismiss} className="text-danger-red/60 hover:text-danger-red text-lg leading-none">&times;</button>
      )}
    </motion.div>
  );
}
