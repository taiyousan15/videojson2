# Build from repository root: docker build -f worker/Dockerfile -t videojson-worker .
FROM node:20-slim AS base

# Install ffmpeg and openssl for Prisma
RUN apt-get update && apt-get install -y \
    ffmpeg \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build stage
FROM base AS builder
WORKDIR /app/worker

# Copy worker package files
COPY worker/package.json worker/package-lock.json* ./

# Copy prisma schema from root
COPY prisma ../prisma

RUN npm ci

# Generate Prisma client
RUN npx prisma generate --schema=../prisma/schema.prisma

# Copy worker source and shared types
COPY worker/src ./src
COPY worker/tsconfig.json ./
COPY shared ../shared

RUN npm run build

# Production
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /app/worker/node_modules ./node_modules
COPY --from=builder /app/worker/dist ./dist
COPY --from=builder /app/worker/package.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

CMD ["node", "dist/index.js"]
