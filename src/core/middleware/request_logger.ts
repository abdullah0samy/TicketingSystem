import { Request, Response, NextFunction } from 'express';

const requestCounts = new Map<string, { count: number; lastReset: number }>();
const RESET_INTERVAL = 60 * 1000; // 1 minute
const SPAM_THRESHOLD = process.env.NODE_ENV === 'test' ? 100000 : 100; // Loosened for Phase 2 Stress Test
const CLEANUP_INTERVAL = 2 * 60 * 1000; // 2 minutes

// BUG FIX: Periodically clean up stale entries to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, stats] of requestCounts) {
    if (now - stats.lastReset > CLEANUP_INTERVAL) {
      requestCounts.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

/**
 * Middleware to identify and log potential request flooding/spamming.
 * This works alongside rate-limiting but provides specific logging for auditing.
 */
export const requestLogger = (req: any, res: Response, next: NextFunction) => {
  const identifier = req.user?.id?.toString() || req.ip;
  const now = Date.now();
  
  const stats = requestCounts.get(identifier) || { count: 0, lastReset: now };
  
  if (now - stats.lastReset > RESET_INTERVAL) {
    stats.count = 1;
    stats.lastReset = now;
  } else {
    stats.count++;
  }
  
  requestCounts.set(identifier, stats);
  
  if (stats.count > SPAM_THRESHOLD) {
    console.warn(`[API_FLOOD_WARNING] ${req.method} ${req.originalUrl} - User/IP ${identifier} sent ${stats.count} requests in the last minute.`);
  }

  // Log non-GET requests for security tracking
  if (req.method !== 'GET') {
    const userLabel = req.user ? `${req.user.fullNameEn || req.user.fullNameAr || 'Unknown'} (${req.user.role})` : 'Anonymous';
    console.info(`[API_MUTATION] ${req.method} ${req.originalUrl} by ${userLabel}`);
  }

  next();
};
