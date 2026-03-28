# =============================================================================
# Bridge Watch — Backend Dockerfile
# =============================================================================
# Stages:
#   base        shared dependencies
#   dev         hot reload with tsx watch  (docker-compose.dev.yml)
#   builder     compiles TypeScript
#   production  minimal production image   (docker-compose.yml)

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json* ./
RUN npm ci

# -----------------------------------------------------------------------------
# Development — live reload via tsx watch
# -----------------------------------------------------------------------------
FROM base AS dev
COPY tsconfig.json ./
# Source is mounted as a volume at runtime, no COPY needed
EXPOSE 3001 3002
CMD ["npm", "run", "dev"]

# -----------------------------------------------------------------------------
# Builder — compile TypeScript to dist/
# -----------------------------------------------------------------------------
FROM base AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# Production — lean image with only compiled output
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3001 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
