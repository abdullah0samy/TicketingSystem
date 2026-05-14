# Production Dockerfile for ABCH Ticketing System

# --- Step 1: Install all dependencies (once) ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps

# --- Step 2: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Step 3: Production Image ---
FROM node:20-alpine
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/package*.json ./
COPY --from=frontend-builder /app/dist ./dist
COPY server.ts tsconfig.json ./
COPY src ./src

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD npx prisma db push --accept-data-loss && npx tsx server.ts
