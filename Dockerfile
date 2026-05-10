# Production Dockerfile for ABCH Ticketing System

# --- Step 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

# --- Step 2: Backend Dependencies + Prisma Generate ---
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps && npx prisma generate

# --- Step 3: Production Image ---
FROM node:20-alpine
WORKDIR /app

# Install ALL dependencies (tsx needed for runtime, prisma client needs CLI at build)
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps && npx prisma generate

# Copy built frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Copy backend source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the server using tsx
CMD ["npx", "tsx", "server.ts"]
