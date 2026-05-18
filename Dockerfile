# Production Dockerfile for ABCH Ticketing System

# --- Step 1: Install all dependencies ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps
RUN npx prisma generate

# --- Step 2: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Step 3: Production Image ---
FROM node:20-alpine
WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=frontend-builder /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY src ./src

# Create upload directories
RUN mkdir -p uploads/avatars uploads/exports

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD npx prisma db push --accept-data-loss && npx tsx server.ts
