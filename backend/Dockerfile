FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p uploads/avatars uploads/exports

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000
ENV NEST_PORT=4000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main"]
