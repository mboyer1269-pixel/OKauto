# syntax=docker/dockerfile:1
# OKauto API — monorepo-aware multi-stage build (pnpm workspaces).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @okauto/shared --filter @okauto/db --filter @okauto/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/api apps/api
RUN pnpm --filter @okauto/shared build \
  && pnpm --filter @okauto/db build \
  && pnpm --filter @okauto/api build \
  && pnpm deploy --filter @okauto/api --prod /out --legacy \
  && node /out/node_modules/prisma/build/index.js generate --schema /out/node_modules/@okauto/db/prisma/schema.prisma

FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate && addgroup -S okauto && adduser -S okauto -G okauto
WORKDIR /app
COPY --from=build --chown=okauto:okauto /out ./
USER okauto
ENV NODE_ENV=production
EXPOSE 4000
# Migrations run via compose command; server starts with plain node.
CMD ["node", "dist/index.js"]
