FROM public.ecr.aws/docker/library/node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY apps/extension/package.json ./apps/extension/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .
RUN pnpm db:generate
RUN pnpm --filter @okauto/web build

FROM base AS runner
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database/node_modules ./packages/database/node_modules
COPY scripts/docker-entrypoint-web.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
  && chown -R node:node /app

USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV RUN_MIGRATIONS_ON_BOOT=false

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/app/docker-entrypoint.sh"]
