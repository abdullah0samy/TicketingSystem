# Production Dockerfile for ABCH Ticketing System

# --- Step 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# --- Step 2: Production Image ---
FROM node:20-alpine
WORKDIR /app

# Install ALL dependencies (tsx needed for runtime, prisma CLI needed for generate)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# Copy built frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Copy backend source code
COPY . .

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

# Push Prisma schema to DB on every start (idempotent), then start server
CMD npx prisma db push --accept-data-loss && npx tsx server.ts
