FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache wget

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps && npm cache clean --force

COPY . .

RUN npx vite build

RUN mkdir -p uploads/avatars uploads/exports

EXPOSE 3007
ENV NODE_ENV=production
ENV PORT=3007

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3007/api/health || exit 1

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && ./node_modules/.bin/tsx prisma/seed.ts && ./node_modules/.bin/tsx server.ts"]
