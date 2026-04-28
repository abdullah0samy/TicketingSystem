# Production Dockerfile for ABCH Ticketing System

# --- Step 1: Build Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Step 2: Production Image ---
FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy built frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Copy backend source code (including server.ts)
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the server using tsx (already in dependencies)
CMD ["npx", "tsx", "server.ts"]
