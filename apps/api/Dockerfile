# ---- build stage ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile=false --filter @openlot/api... --filter @openlot/shared...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @openlot/shared build && pnpm --filter @openlot/api build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
RUN corepack enable && addgroup -S app && adduser -S app -G app
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
