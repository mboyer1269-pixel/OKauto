FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --filter @okauto/api... --frozen-lockfile=false

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @okauto/shared build \
 && pnpm --filter @okauto/api prisma:generate \
 && pnpm --filter @okauto/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=build /app /app
WORKDIR /app/apps/api
RUN mkdir -p uploads
EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma:migrate && node dist/index.js"]
