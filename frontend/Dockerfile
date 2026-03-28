# =============================================================================
# Bridge Watch — Frontend Dockerfile
# =============================================================================
# Stages:
#   base        shared dependencies
#   dev         Vite dev server with HMR   (docker-compose.dev.yml)
#   builder     Vite production build
#   production  Nginx serving static files  (docker-compose.yml)

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json* ./
RUN npm ci

# -----------------------------------------------------------------------------
# Development — Vite dev server with hot module replacement
# -----------------------------------------------------------------------------
FROM base AS dev
# Source is mounted as a volume at runtime, no COPY needed
EXPOSE 5173
# --host 0.0.0.0 required so Vite is reachable from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# -----------------------------------------------------------------------------
# Builder — Vite production build
# -----------------------------------------------------------------------------
FROM base AS builder
COPY . .
RUN npm run build

# -----------------------------------------------------------------------------
# Production — Nginx serving pre-built static assets
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config: SPA routing + API/WS proxy to backend container
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
