FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

FROM base AS deps
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
ENV DATABASE_URL=postgresql://okauto:okauto@postgres:5432/okauto
RUN pnpm --filter @okauto/shared build \
 && pnpm --filter @okauto/db exec prisma generate \
 && pnpm --filter @okauto/db build \
 && pnpm --filter @okauto/web build \
 && pnpm --filter @okauto/worker build \
 && pnpm --filter @okauto/extension build

FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@okauto/web", "start"]

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app /app
CMD ["pnpm", "--filter", "@okauto/worker", "start"]
