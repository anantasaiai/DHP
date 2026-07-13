# ── build: install deps and compile TypeScript ────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && npm install -g @nestjs/cli@10
RUN pnpm --filter @slotq/types build
RUN cd apps/core-api && node_modules/.bin/prisma generate
RUN pnpm --filter @slotq/core-api build

# ── runtime: lean production image ───────────────────────────────────────────
FROM node:22-alpine AS runtime
RUN apk add --no-cache tini
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S slotq && adduser -S slotq -G slotq
COPY --from=build /app/apps/core-api/dist ./dist
COPY --from=build /app/apps/core-api/package.json ./
COPY --from=build /app/node_modules ./node_modules
USER slotq
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1
