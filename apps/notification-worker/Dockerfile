# ── deps: install workspace deps with frozen lockfile ─────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY apps/notification-worker/package.json apps/notification-worker/
COPY packages/types/package.json packages/types/
RUN corepack enable && pnpm install --frozen-lockfile

# ── build: compile TypeScript ─────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable && pnpm --filter @slotq/notification-worker build

# ── runtime: lean production image ───────────────────────────────────────────
# No EXPOSE or HTTP healthcheck — this is a BullMQ consumer, not a server.
# Liveness is checked via ECS process-level health or a Redis ping script (§3A.5).
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S slotq && adduser -S slotq -G slotq
COPY --from=build /app/apps/notification-worker/dist ./dist
COPY --from=build /app/apps/notification-worker/package.json ./
COPY --from=deps /app/node_modules ./node_modules
USER slotq
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
