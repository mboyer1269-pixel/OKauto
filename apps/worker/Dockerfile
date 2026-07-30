FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @okauto/shared build \
 && pnpm --filter @okauto/db build \
 && pnpm --filter @okauto/worker build

FROM base AS runner
ENV NODE_ENV=production
ENV OKAUTO_WORKER_START=1
WORKDIR /app
COPY --from=build /app /app
CMD ["pnpm", "--filter", "@okauto/worker", "start"]
