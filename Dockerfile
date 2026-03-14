# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json ./
# Use install since lockfile might be out of sync
RUN npm install

# ── Development stage (for testing) ─────────────────────
FROM node:22-alpine AS development

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# ── Production stage ─────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/
COPY public/ ./public/

# Non-root user for security
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser
USER appuser

EXPOSE 3000

CMD ["node", "src/index.js"]
