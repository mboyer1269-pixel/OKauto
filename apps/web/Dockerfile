# ---- build stage ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false --filter @openlot/web... --filter @openlot/shared...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @openlot/shared build && pnpm --filter @openlot/web build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static apps/web/.next/static
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
