import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import express from 'express';
import { DIST_DIR } from './src/core/paths';

// BigInt serialization fix
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function startServer() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance() as express.Application;

  const PORT = Number(process.env.NEST_PORT) || Number(process.env.PORT) || 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    expressApp.use(vite.middlewares);
  } else {
    expressApp.use(express.static(DIST_DIR));
    expressApp.get('*', (req: any, res: any) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  }

  await app.listen(PORT, '0.0.0.0');
  console.log(`🏥 ABCH Ticketing System running on http://localhost:${PORT}`);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
