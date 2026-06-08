import app from './src/app.ts';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { initSocket } from './src/core/socket.ts';
import { initCron } from './src/core/cron.ts';
import { DIST_DIR } from './src/core/paths.ts';

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = createServer(app);
  
  // Initialize Socket.io
  initSocket(httpServer);

  // Initialize Cron Jobs
  initCron();

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR));
    app.get('*', (req: any, res: any) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🏥 ABCH Ticketing System running on http://localhost:${PORT}`);
  });

  // Graceful shutdown: close DB pool and HTTP server on process exit
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);
    const { default: prisma } = await import('./src/core/db.ts');
    await prisma.$disconnect();
    httpServer.close(() => {
      console.log('✅ Server closed. DB pool released.');
      process.exit(0);
    });
    // Force exit after 10s if connections won't close
    setTimeout(() => process.exit(1), 10000);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
