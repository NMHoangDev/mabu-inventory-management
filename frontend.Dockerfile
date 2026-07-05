# =============================================================================
# Stage 1 — build: compile Next.js standalone output
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Bật pnpm nếu muốn, nhưng hiện repo dùng npm + package-lock.json, nên bám npm.
COPY package.json package-lock.json ./

# Build cần deps + dev deps (typescript/typescript-types) → `npm ci` mặc định
# cài cả hai, không dùng --omit=dev ở stage này.
RUN npm ci --no-audit --no-fund

# Copy toàn bộ source. .dockerignore sẽ loại trừ .next / node_modules / data / scratch.
COPY . .

# Build Next.js. `next build` đọc output mode (mặc định `.next`).
# Không hard-code `output: 'standalone'` để tránh phá cấu hình sẵn có.
RUN npm run build

# =============================================================================
# Stage 2 — runtime: chỉ giữ package.json + .next + public đã build
# =============================================================================
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Add non-root user
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nextjs -u 1001

# Cài production deps riêng để image gọn hơn — không cần TypeScript toolchain.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy built artifacts (.next + public + config files)
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/next.config.mjs ./next.config.mjs

# Quyền ghi cho data/, db/, extensions/ (mounted volumes ở compose)
# Tạo trước các thư mục để chown về user non-root, tránh mount-volume ghi đè quyền.
RUN mkdir -p /app/data /app/db /app/extensions /app/scratch \
    && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
    CMD wget -qO- http://127.0.0.1:4000/api/state >/dev/null 2>&1 \
    || wget -qO- http://127.0.0.1:4000/ >/dev/null 2>&1 \
    || exit 1

CMD ["npm", "run", "start"]
