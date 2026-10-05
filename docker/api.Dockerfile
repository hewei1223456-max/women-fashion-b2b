# ============================================================================
# 多阶段构建：只把 dist 与生产依赖带进最终镜像
# 构建：docker build -f docker/api.Dockerfile -t wfb-api .
# ============================================================================
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------- 依赖安装 ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/shared-utils/package.json packages/shared-utils/
COPY packages/shared-api/package.json packages/shared-api/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @wfb/api... --filter "./packages/*"

# ---------- 构建 ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter "./packages/*" run build && pnpm --filter @wfb/api run build

# ---------- 运行 ----------
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3100
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=build /app/packages/*/dist ./packages/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY package.json ./
# 本地 OSS 降级的静态目录
RUN mkdir -p /app/uploads
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
