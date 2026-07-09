# =============================================================================
# Zalo Bridge — Express server (Node 20)
# Bridge nhận cookie từ Chrome Extension và forward message tới InvoiceFlow
# frontend qua SSE. Cần `sharp` (native) nên dùng đầy đủ build toolchain.
# =============================================================================
FROM node:20-alpine AS deps

# sharp cần python3 + make + g++ cho build prebuilt binary trên alpine.
# Tuy nhiên với alpine, sharp hiện phân phối prebuilt qua @img/sharp → KHÔNG
# cần cài, nhưng cài cho chắc trong trường hợp phiên bản alpine khác.
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy toàn bộ bridge trước để giải quyết `file:./zca-js` (local file ref).
# `.dockerignore` ở repo root đã bỏ .next / node_modules / scratch nên lệnh
# COPY bridge vẫn nhanh.
COPY services/zalo-bridge ./

# Cài production deps. Cần --include=dev trong trường hợp zca-js phụ thuộc
# build script, nhưng đã có dist/ → chỉ cần production.
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# =============================================================================
# Runtime stage
# =============================================================================
FROM node:20-alpine AS runner

ENV NODE_ENV=production \
    PORT=3001 \
    HOST=0.0.0.0

WORKDIR /app

RUN addgroup -g 1001 -S nodejs \
    && adduser -S bridge -u 1001

# Chỉ copy node_modules + source từ stage `deps`. routes/services/utils
# KHÔNG copy riêng — code bridge thật nằm hết trong src/routes,src/services,
# src/utils; các thư mục top-level routes/services/utils cùng tên chỉ là thư
# mục rác rỗng còn sót lại cục bộ (không track git) — COPY chúng làm build
# fail "no such file or directory" trên máy không có thư mục rác đó.
COPY --from=deps --chown=bridge:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=bridge:nodejs /app/src ./src
COPY --from=deps --chown=bridge:nodejs /app/zca-js ./zca-js
COPY --from=deps --chown=bridge:nodejs /app/package.json ./package.json

# Thư mục data/sessions cần ghi được (mounted volume ở compose)
RUN mkdir -p /app/data /app/storage \
    && chown -R bridge:nodejs /app

USER bridge

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3001/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/index.js"]
