# LotPilot worker (scheduled sync / notifications) — runs TypeScript via tsx.
FROM node:22-alpine
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @lotpilot/worker... --filter @lotpilot/db...
COPY packages ./packages
COPY apps/worker ./apps/worker
RUN pnpm --filter @lotpilot/db generate
ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@lotpilot/worker", "start"]
