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

# Install dependencies first (layer cache friendly). This layer is only
# invalidated when package.json changes, not on every source edit. The
# BuildKit cache mount keeps npm's package cache across builds so even an
# invalidated install re-downloads as little as possible.
COPY package.json ./
RUN --mount=type=cache,sharing=locked,target=/root/.npm npm install

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

COPY package.json ./
RUN --mount=type=cache,sharing=locked,target=/root/.npm npm install --omit=dev && npm cache clean --force || true

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Non-root user for security (UID 10001)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup -u 10001 && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

# entrypoint.sh sources a mounted Secret volume (issue #1293) into env vars
# before exec'ing the app, so no application code has to change.
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
