# =============================================================================
# zalo-account-module — Next.js app thuần (next start, không có worker nền).
# Build context = repo root (giống zalo-bridge.Dockerfile) để COPY riêng thư
# mục con.
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY services/zalo-account-module/package.json services/zalo-account-module/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY services/zalo-account-module .

RUN npm run build

# =============================================================================
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=3002 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
    && adduser -S acctmod -u 1001

COPY services/zalo-account-module/package.json services/zalo-account-module/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=builder --chown=acctmod:nodejs /app/.next ./.next
COPY --from=builder --chown=acctmod:nodejs /app/next.config.mjs ./next.config.mjs

USER acctmod

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3002/api/health >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "start"]
