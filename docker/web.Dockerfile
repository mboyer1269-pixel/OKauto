# LotPilot web (Next.js dashboard + API)
FROM node:22-alpine AS base
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @lotpilot/web... --filter @lotpilot/db...
COPY packages ./packages
COPY apps/web ./apps/web
RUN pnpm --filter @lotpilot/db generate \
  && SESSION_SECRET=build-placeholder pnpm --filter @lotpilot/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["npx", "next", "start", "-p", "3000"]
