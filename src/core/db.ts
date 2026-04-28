import { PrismaClient } from '@prisma/client';

// Singleton pattern: prevents connection pool exhaustion from multiple PrismaClient instances
// during Vite HMR in development.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    errorFormat: 'minimal',
  });

// Capture and log all Prisma-level query errors for production observability.
// Using $use middleware (compatible with all Prisma versions).
// In production, pipe these logs to DataDog / CloudWatch / Sentry as needed.
prisma.$use(async (params, next) => {
  try {
    return await next(params);
  } catch (error: any) {
    console.error(`🔴 [Prisma] ${params.model}.${params.action} failed:`, error?.message ?? error);
    throw error;
  }
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;


export default prisma;
