# =============================================================================
# zalo-forward-module — Next.js app + custom server (poller nền chạy cùng
# process, xem services/zalo-forward-module/server.js). Build context = repo
# root (giống zalo-bridge.Dockerfile) để COPY riêng thư mục con.
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY services/zalo-forward-module/package.json services/zalo-forward-module/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY services/zalo-forward-module .

RUN npm run build

# =============================================================================
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=3003 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
    && adduser -S forwardmod -u 1001

COPY services/zalo-forward-module/package.json services/zalo-forward-module/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --from=builder --chown=forwardmod:nodejs /app/.next ./.next
COPY --from=builder --chown=forwardmod:nodejs /app/next.config.mjs ./next.config.mjs
COPY --from=builder --chown=forwardmod:nodejs /app/server.js ./server.js
COPY --from=builder --chown=forwardmod:nodejs /app/worker ./worker

USER forwardmod

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3003/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
