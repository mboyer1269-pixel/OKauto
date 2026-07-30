# syntax=docker/dockerfile:1
# OKauto web dashboard — monorepo-aware build using Next standalone output.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.3 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @okauto/shared --filter @okauto/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @okauto/shared build && pnpm --filter @okauto/web build

FROM node:22-alpine AS runtime
RUN addgroup -S okauto && adduser -S okauto -G okauto
WORKDIR /app
COPY --from=build --chown=okauto:okauto /app/apps/web/.next/standalone ./
COPY --from=build --chown=okauto:okauto /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=okauto:okauto /app/apps/web/public ./apps/web/public
USER okauto
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
