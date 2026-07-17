# Tài liệu tham chiếu kỹ thuật — Tính năng "Thông báo Zalo"

> Tổng hợp toàn bộ file/hàm liên quan tới tính năng nhắn tin Zalo (trang `/thong-bao-zalo`, quản lý tài khoản Zalo, auto-forward). Mục đích: tra cứu nhanh "tính năng X nằm ở file nào, hàm nào" khi cần sửa/debug — không phải tài liệu kiến trúc quyết định thiết kế (xem `CLAUDE.md` cho phần đó).

## 0. Bức tranh tổng thể

Tính năng này có **2 phần chạy tách biệt**, cùng ghi vào 1 Supabase project:

1. **Frontend Next.js** (`app/(dashboard)/thong-bao-zalo`, `components/zalo/*`, `app/api/zalo/*`) — giao diện cho nhân viên đọc/trả lời tin nhắn, quản lý tài khoản/nhân viên, quản lý forward rules. Đọc dữ liệu cache từ Supabase (`zalo_conversations_ui`, `zalo_messages`) qua các route `app/api/zalo/*`, và gọi trực tiếp sang bridge (`app/api/all-platform/zalo/*` qua `lib/zalo-api.ts`) để lấy dữ liệu live/gửi tin.
2. **`services/zalo-bridge`** (Express + `zca-js`) — service Node độc lập, login vào 1 tài khoản Zalo cá nhân thật, expose REST + SSE, và **tự ghi trực tiếp vào Supabase** (không qua Next.js) để dữ liệu luôn có mặt kể cả khi không ai mở trang dashboard.

```
Nhân viên (browser)
   │
   ├─ app/(dashboard)/thong-bao-zalo/page.tsx ──► components/zalo/ZaloPageContent.tsx
   │                                                   │
   │                                          components/zalo/useZalo.ts (hook trung tâm)
   │                                                   │
   │            ┌──────────────────────────────────────┼───────────────────────────────┐
   │            ▼                                       ▼                               ▼
   │   app/api/zalo/*  (đọc/ghi cache Supabase,   lib/zalo-api.ts → gọi thẳng bridge   SSE: bridge → browser
   │   quản lý account/staff/forward-rules)        (/api/all-platform/zalo/*)           (new_message, ...)
   │
services/zalo-bridge (Node, luôn chạy)
   │
   ├─ src/index.js (bootstrap Express + SSE + static QR/extension pages)
   ├─ src/routes/*  (auth, accounts, zalo-client [API chính], webhook [Chatwoot], extension, status)
   ├─ src/services/sessionManager.js  (giữ session zca-js, lắng nghe WS message)
   ├─ src/services/supabaseSync.js    (tự ghi message/conversation vào Supabase)
   ├─ src/services/forwardEngine.js   (auto-forward "nhóm chính" → nhóm đích)
   ├─ src/services/threadInfoResolver.js (resolve tên thật group/user)
   ├─ src/services/chatwootService.js (đồng bộ 2 chiều với Chatwoot)
   └─ src/services/accountRegistry.js (đăng ký nhiều tài khoản Zalo)
```

---

## 1. Frontend — Trang (Pages)

### `app/(dashboard)/thong-bao-zalo/page.tsx`
Trang chính (client component, default export `ZaloPage()`).
- Check đăng nhập nhân viên qua `zaloAuthApi.me()` (`lib/zalo-api.ts`) — chưa đăng nhập thì hiện gate + link `/login`.
- Nếu đã đăng nhập: `next/dynamic` (ssr:false) load `components/zalo/ZaloPageContent.tsx`.
- Header có `ZaloAccountSwitcher` + link tải Chrome extension.

### `app/(dashboard)/zalo/accounts/page.tsx`
Trang quản lý tài khoản Zalo (server component, `export const dynamic = "force-dynamic"`).
- `loadInitialData()` (nội bộ, async) — SSR: đọc cookie `current_staff_id`, query thẳng Supabase (`staff`, `zalo_accounts`, `staff_zalo_assignments`) để xác định role và lọc account/assignment nhân viên được xem.
- `ZaloAccountsPage()` (default export) — gọi `loadInitialData()`, render `ZaloAccountsDashboard` với data khởi tạo.

### `app/(dashboard)/zalo/forward-rules/page.tsx`
Trang quản lý forward rules (server component).
- `loadRole()` (nội bộ) — đọc cookie staff, query `staff.role`; mặc định `"admin"` nếu không có cookie (backward-compat) hoặc lỗi.
- `ZaloForwardRulesPage()` (default export) — render `ZaloForwardRulesDashboard` với prop `role` (phân quyền thật enforce ở API route, không phải ở đây).

---

## 2. Frontend — Components (`components/zalo/`)

| File | Export chính | Chức năng |
|---|---|---|
| `ZaloAccountSwitcher.tsx` | `ZaloAccountSwitcher()` | Dropdown chọn/tạo tài khoản Zalo ở header. Poll `refreshZaloAccounts()` mỗi 15s; nghe custom event `zalo-account-status-changed`/`zalo-account-changed` (bắn ra từ `useZalo`) để refresh ngay. Nội bộ: `handlePick()`, `handleCreate()` (gọi `zaloAccountsApi.create()`). |
| `ZaloAuthCard.tsx` | `ZaloAuthCard(props)` | Card hiển thị trạng thái đăng nhập/kết nối Zalo (connected/expired/disconnected) + nút Import/Logout/Refresh/Reconnect WS — thuần presentational, nhận callback từ `useZalo` qua `ZaloPageContent`. |
| `ZaloBroadcastPanel.tsx` | `ZaloBroadcastPanel(props)` | Modal soạn + gửi broadcast hàng loạt (tối đa 20 tin, chọn nhiều người nhận). `handleSend()` (nội bộ) gọi prop `onSend` (nối vào `useZalo.sendBroadcast`). |
| `ZaloChatPanel.tsx` | `ZaloChatPanel(props)`, `MessageBubble({msg})` (nội bộ) | Khung chat: hiển thị tin nhắn, composer text/file (drag-drop), nút "Sync". Enter/click gửi → `onSend()`; `onSync()` → `useZalo.syncCurrentChat`. |
| `ZaloPageContent.tsx` | `ZaloPageContent()` | Layout 3 cột (danh sách hội thoại + khung chat + modal broadcast). Gọi `useZalo()` 1 lần, truyền state/handler xuống các component con. Hiện banner trạng thái SSE (`z.sseState`), tiến độ broadcast, toast. |
| `ZaloConversationList.tsx` | `ZaloConversationList(props)` | Sidebar danh sách hội thoại: tìm kiếm, nút Broadcast, link `/zalo/forward-rules`, nút Sync. Nội bộ: `formatRelativeTime()`. |
| `ZaloAccountsDashboard.tsx` | `ZaloAccountsDashboard({initialData})` (default), `AssignModal` (nội bộ) | Dashboard `/zalo/accounts`: CRUD account + staff + gán quyền (can_view/can_send/can_broadcast). Nội bộ: `refresh()`, `handleCreate()`, `handleCreateStaff()`, `handleAssign()`/`handleUnassign()`, `handleResetPassword()` (gọi thẳng `POST /api/zalo/staff/[id]/reset-password`), `handleDelete()`. |
| `ZaloForwardRulesDashboard.tsx` | `ZaloForwardRulesDashboard({role})` (default), `GroupPickerList`, `RuleEditorModal` (nội bộ) | Dashboard `/zalo/forward-rules`: list rule (nhóm chính → nhóm đích) theo `currentAccountId`. Nội bộ: `refresh()` (gọi `zaloForwardRulesApi.list()` + `fetch("/api/zalo/conversations?...")`), `toggleEnabled()`/`handleDelete()`, `toggleLogs()` (lazy-load log qua `zaloForwardRulesApi.logs()`), `RuleEditorModal.handleSave()`. |

---

## 3. Frontend — Hook trung tâm: `components/zalo/useZalo.ts`

Export duy nhất: `useZalo()`. Đây là nơi nắm **toàn bộ state + logic** của trang thông báo Zalo — mọi component chỉ hiển thị theo state hook này trả về.

**Helper cấp module (không export):**
- `dedupeMessages(list)` — khử trùng tin nhắn theo `message_id` (ưu tiên bản có `content` dài hơn), fallback key `(timestamp|sender|content)` cho row cũ thiếu id ổn định.
- `sortConversationsByLatestMessage(list)` — sắp xếp hội thoại theo `latest_message_at`/`last_message_ts` giảm dần.
- `saveConversationsToSupabase(list, accountId)` — `POST /api/zalo/conversations` (fire-and-forget, `keepalive`).
- `requestExtensionDomSync(accountId)` — nhờ Chrome extension scrape DOM Zalo Web (qua `window.postMessage`) khi API bridge không resolve được tên — timeout 15s.
- `ensureConversationInSupabase(threadId, threadType, accountId, fallbackName, latest)` — hàm lõi "đảm bảo có row đúng tên thật trong `zalo_conversations_ui`": check DB → nếu thiếu/tên fallback (regex `FALLBACK_NAME_RE`) thì gọi `zaloApi.getGroupInfo()`/`getUserInfo()`, fallback tiếp `requestExtensionDomSync()` nếu bridge lỗi → upsert `POST /api/zalo/conversations`.
- `saveMessagesToSupabase(threadId, list, accountId, opts)` — `POST /api/zalo/messages` (hỗ trợ `insertOnly` để không đè row bridge đã lưu, và `threadType` để giữ đúng phân loại group/user).

**State & hàm trả về từ `useZalo()`:**
- **Auth**: `loginStatus`, `authLoading`, `authError`, `isLoggedIn`; `refreshAuth` (poll `zaloApi.getLoginStatus()` mỗi 5s); `logout()`; `importFromExtension()` (bridge sang `window.__zaloExtension` để import cookie); `reconnectBridge()`/`reconnecting` (gọi `zaloApi.reconnect()` — fix lỗi "Overlimit connection").
- **Đổi tài khoản**: `useEffect` theo dõi `currentAccountId` (từ `useApp()`) — reset toàn bộ state cục bộ khi đổi account.
- **Hội thoại**: `conversations`, `loadingConvs`; `fetchConversations()` (gọi `zaloApi.getConversations()` — live từ bridge, sort, lưu Supabase); `refreshConversations` (= alias của `fetchConversations`, đọc cache nhanh từ `GET /api/zalo/conversations`); `syncConversations()` (gọi `zaloApi.syncConversations()` rồi `fetchConversations()`).
- **Mở hội thoại/tin nhắn**: `openConvId`, `messages`, `loadingChat`, `sending`, `replyText`/`setReplyText`, `pendingFiles`/`setPendingFiles`; `openConversation(convId)` (ensure DB row nếu thread mới, fetch `GET /api/zalo/messages`, mark-read `POST /api/zalo/threads/[id]/read` + `zaloApi.markRead()`); `refreshCurrentThread()` (nội bộ, refetch tin nhắn thread đang mở — dùng bởi SSE/visibility handler); `syncCurrentChat()`; `sendCurrentMessage` (gửi qua `zaloApi.sendMedia()`/`sendMessage()`, clear composer, đợi 300ms rồi refresh).
- **Broadcast**: `broadcasting`, `broadcastStatus`, `sendBroadcast()` (gọi `zaloApi.sendBroadcast()`, poll `zaloApi.getBroadcastStatus()` mỗi 3s).
- **SSE real-time**: `sseState` (`connecting|open|closed|reconnecting`) — mở `EventSource` qua `zaloApi.openEventSource()`, auto-reconnect backoff `[3s,6s,12s,24s,30s]`. Xử lý event `new_message` (parse payload, `saveMessagesToSupabase()` nếu có `message_id` ổn định, `ensureConversationInSupabase()` để đảm bảo tên đúng, cập nhật/sort `conversations` cục bộ, refresh thread nếu đang mở), `session_expired`, `auth-status`, `account_status_changed` (re-dispatch `zalo-account-status-changed` cho `ZaloAccountSwitcher`).
- **Khác**: `toast`/`showToast()` (toast tự tắt sau 3.5s).

---

## 4. Frontend — API client: `lib/zalo-api.ts`

Helper nội bộ `request<T>()` (không export) — wrap `fetch` gọi thẳng bridge (`BRIDGE_URL`, mặc định `http://localhost:3001`), gắn header `X-User-ID`/`X-API-Key`, timeout/abort, throw `ZaloApiError` khi lỗi.

### `zaloApi` — gọi thẳng bridge (`/api/all-platform/zalo/*`)
| Hàm | Endpoint | Chức năng |
|---|---|---|
| `getLoginStatus` | `GET /auth/status` | Trạng thái đăng nhập Zalo |
| `importSession` | `POST /auth/import-session` | Import session dự phòng (bình thường extension làm) |
| `logout` | `DELETE /auth/logout/:accountId` | Đăng xuất |
| `reconnect` | `POST /auth/reconnect` | Force restart WS bridge |
| `getConversations` | `GET /conversations` | List hội thoại live |
| `syncConversations` | `POST /conversations/sync` | Resync friend/group từ Zalo |
| `getGroupInfo` | `GET /group-info` | Resolve tên/avatar group thật (trả `null` nếu lỗi, không throw) |
| `getUserInfo` | `GET /user-info` | Resolve tên/avatar user thật (tương tự) |
| `getMessages` | `GET /api/zalo/messages` (Next route, không qua bridge) | Đọc tin nhắn từ Supabase cache |
| `syncMessages` | — | Stub no-op (bridge chưa có route tương ứng) |
| `sendMessage` | `POST /conversations/:id/send` | Gửi text |
| `sendMedia` | `POST /conversations/:id/send-media` (multipart) | Gửi file/ảnh kèm caption |
| `markRead` | `POST /conversations/:id/read` | Đánh dấu đã đọc trên server Zalo |
| `sendBroadcast` | `POST /broadcasts` | Tạo campaign broadcast |
| `getBroadcastStatus` | `GET /broadcasts/:campaignId` | Poll tiến độ campaign |
| `subscribeEvents` | `GET /events` (SSE) | Helper subscribe SSE (không dùng ở `useZalo`, dùng `openEventSource` thay thế) |
| `openEventSource` | `GET /events` (SSE) | Trả `EventSource` thô để `useZalo` tự quản lý reconnect |

### `zaloAccountsApi` — gọi Next.js route `/api/zalo/accounts`
`list()`, `get(id)`, `create(payload)`, `update(id, payload)`, `remove(id)`.

### `zaloStaffApi` — gọi Next.js route `/api/zalo/staff`
`list()`, `upsert(payload)`, `assign(staffId, payload)`, `unassign(staffId, accountId)`.

### `zaloAuthApi` — gọi Next.js route `/api/auth/zalo/me`
`me()`, `login(staffId, password)`, `logout()`.

### `zaloForwardRulesApi` — gọi Next.js route `/api/zalo/forward-rules`
`list(accountId)`, `create(payload)`, `update(ruleId, payload)`, `remove(ruleId)`, `logs(ruleId, limit)`.

Ngoài ra export: hằng `ZALO_ACCOUNT_ID`, class `ZaloApiError`, các type `ZaloLoginStatus`/`ZaloConversation`/`ZaloMessage`/`ZaloBroadcast*`/`ZaloAccountSummary`/`StaffRecord`/`StaffAssignment`/`CurrentStaff`/`ZaloForward*`, default export `zaloApi`.

---

## 5. Frontend — API routes (`app/api/zalo/`)

Tất cả dùng `export const dynamic = "force-dynamic"` + `runtime = "nodejs"`. Đa số thao tác Supabase qua REST thô (`fetch` tới `${SUPABASE_URL}/rest/v1/...`). Helper phân quyền (`getCurrentStaff`, `canViewAccount`, `canSendToAccount`, `canBroadcastTo`) nằm ở `lib/zalo/auth` (không thuộc phạm vi khảo sát file này).

| File | Method | Chức năng |
|---|---|---|
| `accounts/route.ts` | GET | Proxy bridge `GET /auth/accounts`, lọc theo quyền `canViewAccount` (trừ admin). Trả 200 kể cả khi bridge lỗi. |
| | POST | Admin-only. Proxy bridge `POST /auth/accounts` tạo account, mirror sang Supabase `zalo_accounts` (best-effort). |
| `accounts/[id]/route.ts` | GET | Proxy bridge `GET /auth/accounts/:id`, yêu cầu `canViewAccount`. |
| | PUT | Admin-only. Proxy bridge `PUT /auth/accounts/:id` (đổi tên/owner/phone). |
| | DELETE | Admin-only. Proxy bridge `DELETE /auth/accounts/:id`. |
| `conversations/sync-dom/route.ts` | POST | Nhận data DOM-scrape từ Chrome extension khi bridge API không resolve được tên → upsert thẳng `zalo_conversations_ui`. Luôn trả 200. |
| `staff/[staffId]/assign/route.ts` | POST | Upsert `staff_zalo_assignments` (can_view/can_send/can_broadcast), check FK `zalo_accounts` tồn tại. |
| | DELETE | Xoá assignment (theo `account_id` query param). |
| `threads/[threadId]/read/route.ts` | POST | Reset `unread_count` về 0 trong `zalo_conversations_ui`. Gọi bởi `useZalo.openConversation()`. Luôn trả 200. |
| `forward-rules/[id]/route.ts` | PATCH | Update rule (tên/`is_enabled`/master/targets). Yêu cầu admin hoặc `canBroadcastTo`. Chạy `validateNoLoop()` chống forward vòng lặp trước khi áp dụng. |
| | DELETE | Xoá rule (targets/logs cascade FK). Yêu cầu admin hoặc `canBroadcastTo`. |
| `forward-rules/[id]/logs/route.ts` | GET | Log forward gần nhất của 1 rule (mặc định 30, tối đa 200), yêu cầu `canViewAccount`. |
| `conversations/route.ts` | GET | Đọc cache `zalo_conversations_ui` theo `account_id`, sort `last_message_ts desc`. Route đọc chính của `useZalo.refreshConversations`/`ZaloForwardRulesDashboard`. Fallback graceful nếu Supabase lỗi. |
| | POST | Upsert `zalo_conversations_ui` (onConflict `account_id,conversation_id`); strip `last_message_ts`/`latest_message_at` null để không đè timestamp hợp lệ. |
| `staff/[staffId]/reset-password/route.ts` | POST | Admin-only. Set `password_hash = null` — nhân viên phải đặt lại mật khẩu ở lần login tiếp theo. |
| `staff/route.ts` | GET | Trả toàn bộ `staff` + `staff_zalo_assignments` (không lọc theo quyền — dùng cho sidebar `ZaloAccountsDashboard`). |
| | POST | Admin-only. Upsert staff theo email. |
| `forward-rules/route.ts` | GET | List rule theo `account_id` kèm targets (2 query, join in-memory). Yêu cầu `canViewAccount`. |
| | POST | Tạo rule + targets mới. Yêu cầu admin/`canBroadcastTo`. Cùng validate chống vòng lặp như PATCH (logic trùng lặp, không import chung). Rollback (xoá rule) nếu insert targets lỗi. |
| `messages/route.ts` | GET | Đọc `zalo_messages` theo `user_id`+`thread_id`, sort `ts asc`, dedupe server-side (giống `dedupeMessages()` ở FE). |
| | POST | Upsert `zalo_messages` (onConflict `user_id,source_message_id`, hỗ trợ `insert_only`). Side-effect: upsert kèm `zalo_conversations_ui` (không hạ cấp `thread_type` group→user, không đè tên đã resolve). |

---

## 6. Backend — `services/zalo-bridge/src/index.js` (entry point)

Bootstrap Express app:
- Load `.env.local` từ root repo nếu thiếu biến Supabase (dùng chung env với Next.js).
- `accountRegistry.ensureBootstrapped()` — tự đăng ký account `shop-owner`.
- `setZaloEventBus(zaloEventBus)` — inject SSE broadcaster (export từ `routes/zalo-client.js`) vào `sessionManager.js`, tránh circular import.
- CORS middleware (echo origin, cho phép header `x-user-id`/`x-account-id`).
- Static pages: `/connect` (QR login), `/extension-install`, `/extension-download` (zip extension).
- `/config` — trả bridge URL + API key cho extension/frontend tự cấu hình.
- Middleware API-key gate (`BRIDGE_API_KEY`) cho path không public.
- Mount router 2 lần: root (`/auth`, `/webhook`, `/status`, `/api`) và dưới prefix `/zalo-bridge/*` (cho reverse-proxy).
- `httpServer.listen` → `sessionManager.restoreAll()` khôi phục toàn bộ session đã lưu trên đĩa.
- Handler `SIGTERM`/`uncaughtException`/`unhandledRejection`.

---

## 7. Backend — Routes (`services/zalo-bridge/src/routes/`)

### `auth.js` — vòng đời login/session 1 account
| Method/Path | Chức năng |
|---|---|
| POST `/qr-login` | `sessionManager.startQrLogin()` |
| GET `/qr-image/:accountId` | Poll (≤15s) `sessionManager.getQrImage()`, stream PNG |
| GET `/status/:accountId` | `sessionManager.getStatus()` |
| GET `/session/:accountId` | Check nhanh (cache) cho Chatwoot `ZaloConnectPage.vue`; set `chatwootAccountId` |
| POST `/cookie-login` | `sessionManager.loginWithCookies()` (cookie từ extension) |
| POST `/set-inbox` | `sessionManager.setInboxId()` |
| POST `/sync-contacts` | `sessionManager.syncMissedMessages()`, nếu `fullSync` thì thêm `chatwootService.syncAllZaloContacts()` |
| DELETE `/logout/:accountId` | `sessionManager.destroySession()` |

### `extension.js`
| Method/Path | Chức năng |
|---|---|
| POST `/all-platform/zalo/auth/import-session` | Extension POST cookie sau khi scrape session Zalo Web → `sessionManager.loginWithCookies()` |

### `status.js`
| Method/Path | Chức năng |
|---|---|
| GET `/sessions` | `sessionManager.listSessions()` |
| GET `/sessions/:accountId` | `sessionManager.getStatus()` |

### `webhook.js` — tích hợp Chatwoot ⇄ Zalo
| Method/Path | Chức năng |
|---|---|
| POST `/chatwoot-outgoing` | Nhận webhook Chatwoot (`message_created`/`message_updated`): recall/xoá tin trên Zalo khi Chatwoot xoá; tải attachment Chatwoot rồi `sessionManager.sendMessage()`; lệnh `/sticker <id>` qua `api.sendSticker()`; update `external_id` qua `chatwootService`. Helper nội bộ: `cacheProcessedOutgoing`, `getChatwootAccountId`, `resolveBridgeSessionAccountId`, `downloadAttachment`. |
| POST `/send-message` | Gửi trực tiếp (N8N/test) → `sessionManager.getApi().sendMessage()` |
| POST `/typing` | Relay typing indicator → `api.sendTypingEvent()` |

### `accounts.js` (mount `/auth/accounts`) — CRUD đa tài khoản
| Method/Path | Chức năng |
|---|---|
| GET `/` | List account (union `accountRegistry` + session runtime), sort theo trạng thái |
| GET `/:id` | Chi tiết 1 account (`composeAccount`) |
| POST `/` | Đăng ký accountId + displayName mới, trả `qrLoginUrl` |
| PUT `/:id` | Update metadata (`accountRegistry.upsertAccount()`) |
| DELETE `/:id` | Xoá khỏi registry (chặn nếu đang `logged_in`) |

Helper nội bộ: `composeAccount(id)`.

### `zalo-client.js` (mount `/api`) — API chính cho frontend + SSE
Export: `cacheThreadType()` (populate cache `globalThis.__zaloThreadTypeCache`, dùng chung với `sessionManager.js`), `zaloEventBus` (`{broadcast(type,data)}`, inject vào `sessionManager.js` qua `index.js`).

| Method | Path | Chức năng |
|---|---|---|
| GET | `/all-platform/zalo/auth/status` | Trạng thái login |
| POST | `/all-platform/zalo/auth/reconnect` | Force restart WS listener (`sessionManager.restartListener`), rate-limit 1 lần/5s |
| GET | `/all-platform/zalo/conversations` | Merge `getCMRecent` + `getAllFriends` + resolve tên group theo batch 5 |
| GET | `/all-platform/zalo/group-info` | `threadInfoResolver.resolveGroupInfo` |
| GET | `/all-platform/zalo/user-info` | `threadInfoResolver.resolveUserInfo` |
| POST | `/all-platform/zalo/conversations/sync` | Refresh số lượng friend/group |
| GET | `/all-platform/zalo/conversations/:id/messages` | `getGroupChatHistory`/`getUserChatHistory`, chuẩn hoá shape |
| POST | `/all-platform/zalo/conversations/:id/sync-messages` | Alias fetch history, báo số tin mới |
| POST | `/all-platform/zalo/conversations/:id/send` | `sessionManager.sendMessage()` gửi text |
| POST | `/all-platform/zalo/conversations/:id/send-media` | Multer upload (field `files`) → rename đúng extension → `sessionManager.sendMessage({attachments})` |
| POST | `/all-platform/zalo/conversations/:id/read` | Ack no-op (zca-js không có API mark-read) |
| POST | `/all-platform/zalo/broadcasts/preview` | Trả số lượng target preview |
| POST | `/all-platform/zalo/broadcasts` | Campaign broadcast async (delay 3s/target, 5s/message), track ở Map `campaigns` |
| GET | `/all-platform/zalo/broadcasts/:campaignId` | Poll tiến độ campaign |
| GET | `/all-platform/zalo/events` | SSE, filter theo `account_id`, heartbeat 25s |

Helper nội bộ: `getGlobalCache`, `lookupThreadType`, `getAccountId`, `requireLoggedIn` (auth guard dùng ở hầu hết route), `parseThreadId`, `resolveThreadTypeAsync`, `resolveFinalType`, `broadcastEvent`.

---

## 8. Backend — Services (`services/zalo-bridge/src/services/`)

### `accountRegistry.js`
Lưu metadata account vào `data/accounts.json` (ghi debounce 500ms).
`getAccount(id)`, `listAccounts()`, `upsertAccount(id, patch)`, `setStatus(id, status, opts)`, `removeAccount(id)`, `ensureBootstrapped()` (auto-đăng ký `shop-owner`, gọi từ `index.js`), `hydrateFromList(list)` (sync từ Supabase `zalo_accounts`), `flush()`.

### `chatwootService.js`
Toàn bộ tích hợp Chatwoot REST. Export object `chatwootService` + `isChatwootEnabled`:
- `handleIncomingMessage(accountId, inboxId, msg, api, isSelf)` — import Zalo→Chatwoot chính: resolve/tạo contact+conversation, dedupe theo external_id, dispatch theo `msgType` (text/ảnh/doodle/voice/gif/video/location/file/sticker/link...). Gọi từ `sessionManager.js` listener `message` và `syncMissedMessages`.
- `handleIncomingUndo(accountId, inboxId, undoData, api)` — xoá/update tin Chatwoot khi Zalo thu hồi.
- `handleIncomingTyping(...)` — toggle typing indicator Chatwoot.
- `getMessages(accountId, conversationId)` — dedupe/undo-matching.
- `getOrCreateConversationForZaloUser(...)` — helper tạo/tìm contact+conversation, dùng lại ở nhiều nơi.
- `sendToZalo(sessionManager, accountId, zaloUserId, threadType, content)` — wrapper `sessionManager.sendMessage`.
- `updateConversationStatus(...)` — set custom-attribute badge trạng thái.
- `syncAllZaloContacts(accountId, api, inboxId)` — full sync friend+group+conversation vào Chatwoot (gọi từ `/sync-contacts` fullSync và interval 24h).
- `handleIncomingGroupEvent(...)` — note hệ thống khi có join/leave/remove_member.
- `updateAllConversationsStatus(accountId, statusText)` — bulk update banner online/offline.
- `updateMessageExternalId`/`getMessageSourceIdFromDb` — wrapper `utils/db.js`.
- `clearActiveConversations(accountId)` — dọn tracked-conversation set khi destroy session.

### `threadInfoResolver.js`
Resolve tên thật group/user qua ZCA, cache TTL module-level (60s thành công / 60s lỗi-group / 10 phút lỗi-user).
- `resolveGroupInfo(api, accountId, groupId)` — `api.getGroupInfo()` → `{ok, group_name, avatar_url, member_count, group_type}`. Dùng ở `zalo-client.js` (`/group-info`) và `supabaseSync.js`.
- `resolveUserInfo(api, accountId, userId)` — `api.getUserInfo()` → `{ok, user_name, avatar_url}`. Tương tự.

### `supabaseSync.js`
Bridge tự ghi Supabase, độc lập frontend.
- `getClient()` — tạo/lấy Supabase client (fallback anon key nếu thiếu service-role).
- `resolveThreadType(msg)` — chuẩn hoá `msg.type` zca-js → `'group'|'user'`.
- `resolveImageUrls(msg)` — trích 1-nhiều URL ảnh từ payload ảnh zca-js (đơn/mảng/album), log shape lạ. Dùng chung với `forwardEngine.js`.
- `persistIncomingMessage({accountId, threadId, threadType, msg, isSelf, isCatchUp, api})` — upsert `zalo_messages` + `zalo_conversations_ui`; gọi `resolveConversationName()` nội bộ để điền tên thật (KHÔNG BAO GIỜ dùng tên người gửi làm tên group). Gọi từ listener real-time và `catchUpRecentMessages`.
- `reconcileFallbackConversationNames({accountId, api})` — quét `zalo_conversations_ui` tìm row còn tên fallback (`Group <id>`/`Zalo <id>`), resolve lại qua `threadInfoResolver`. Gọi 1 lần mỗi khi login/reconnect.
- `catchUpRecentMessages({accountId, api, count})` — `api.getCMRecent()` rồi persist từng `lastMsgs` (bù tin lỡ khi bridge restart).

Nội bộ (không export): `buildConversationId` (legacy, chỉ dùng cho script dọn dẹp), `resolveMessageId`, `extractOneImageUrl`, `resolveConversationName`.

### `sessionManager.js`
Quản lý session/WS đa tài khoản — lưu credential ở `data/sessions/<accountId>.json`.

Export: `setZaloEventBus(bus)` (inject SSE broadcaster, gọi 1 lần từ `index.js`); object `sessionManager`:
- `startQrLogin`, `loginWithCookies`, `getQrImage`, `getStatus`, `listSessions`, `getSession`
- `sendMessage(accountId, threadId, threadType, content)` — đường gửi tin DUY NHẤT, dùng chung bởi `webhook.js`, `zalo-client.js`, `chatwootService.sendToZalo`; gắn `clientId`+fingerprint để tin gửi ra không bị nhận nhầm lại thành tin đến khi echo về qua WS.
- `getApi(accountId)` — trả instance zca-js thô (dùng trực tiếp ở `webhook.js` cho sticker/undo/typing).
- `getChatwootAccountId`/`setChatwootAccountId`, `checkSessionAlive`, `syncMissedMessages`, `restoreAll()` (gọi từ `index.js` lúc start), `setInboxId`, `destroySession`, `restartListener` (dùng bởi `/auth/reconnect`), `destroyAll()` (SIGTERM).

**Logic lõi** — `attachListener()`: wire toàn bộ event zca-js; handler `api.listener.on('message', ...)` (wrap `withTimeout` 20s) làm, với MỖI tin nhắn đến:
1. Guard listener cũ (`isActiveListener()`).
2. Log raw message (`[RECV]`).
3. Detect `isGroupMsg`, build SSE payload chuẩn hoá.
4. Update `globalThis.__zaloThreadTypeCache` (cache dùng chung với `zalo-client.js`).
5. Broadcast SSE `new_message` (`emitEvent`, qua `_zaloEventBus` inject).
6. Fire-and-forget `persistIncomingMessage()` (ghi Supabase, không phụ thuộc frontend).
7. Nếu là tin group: fire-and-forget `handleIncomingGroupMessage()` (`forwardEngine.js`) — chạy cho MỌI tin kể cả `isSelf`.
8. Nếu `isSelf`: check `isMessageSentByChatwoot`/fingerprint để tránh import lại echo, ngược lại import Chatwoot dạng `outgoing`.
9. Ngược lại: import Chatwoot dạng `incoming`.

Listener `undo`/`typing`/`group_event` → delegate `chatwootService.handleIncoming*`. `connected`/`reconnected` → `triggerSync()` (debounce `syncMissedMessages`). `disconnected`/`closed`/`error` → mark offline, nếu bị kick (code 3000/3003) → `autoReconnect()` (retry tối đa 3 lần/30s) + watchdog 5 phút + sync contact 24h.

### `forwardEngine.js`
Auto-forward "nhóm chính" → nhóm đích theo `zalo_forward_rules`/`zalo_forward_targets`.
- `handleIncomingGroupMessage({accountId, api, msg, threadId})` — **entry point**, gọi fire-and-forget từ `sessionManager.js` cho MỌI tin nhắn group. Dedupe (`forwardedIds`/`processedSource`), load rules (`getRulesForMaster`), rate-limit (`consumeRateBudget`, mặc định 60/phút), dispatch theo loại nội dung: text → `forwardText`; ảnh → `queueImageForBatch`; sticker (object có `id`+`cateId`) → `forwardSticker`; loại khác → log `unsupported`/`skipped`.
- `forwardText(...)` — 1 lệnh `api.forwardMessage()` fan-out tới tất cả target/rule, delay `FORWARD_DELAY_MS` (mặc định 10s) giữa các rule.
- `forwardMedia(...)` — tải ảnh về temp (`downloadToTemp`) rồi gửi tuần tự từng target qua `api.sendMessage({attachments})`; dọn temp file ở `finally`.
- `queueImageForBatch({accountId, api, rules, threadId, sourceMsgId, senderUid, imageUrls})` — **(fix 2026-07-13)** gom các ảnh đến từ cùng người gửi/cùng nhóm nguồn trong cửa sổ `IMAGE_BATCH_MS` (mặc định 1200ms) thành 1 lệnh `forwardMedia()` duy nhất — để nhiều ảnh forward ra thành 1 khối ảnh gộp (album) thay vì từng tin riêng lẻ (Zalo luôn bắn mỗi ảnh trong 1 album như 1 sự kiện WS riêng, chỉ gộp được khi gửi ≥2 ảnh trong CÙNG 1 lệnh `sendMessage`).
- `forwardSticker(...)` — gửi lại qua `api.sendSticker()` tuần tự từng target.

Helper nội bộ: `sleep`, `withRetry` (retry 1 lần, 1.5s), `markForwarded`/`isAlreadyForwarded` (loop-guard 60s), `markSourceProcessed`, `consumeRateBudget`, `loadRulesByMaster`/`getRulesForMaster` (cache 8s, query view `v_zalo_forward_rules_active`), `logForward` (ghi `zalo_forward_logs`), `downloadToTemp`.

---

## 9. Backend — Utils (`services/zalo-bridge/src/utils/`)

### `db.js`
Truy cập trực tiếp Postgres của Chatwoot (qua `pg` Pool) để đối chiếu message Chatwoot ↔ external id Zalo.
`updateMessageSourceId(messageId, sourceId)`, `getMessageSourceId(messageId)`.

### `logger.js`
`logger` — instance `winston` (console transport, format `HH:mm:ss.SSS DD/MM/YYYY`), dùng ở mọi file trong service.

---

## 10. Migration Supabase liên quan (`supabase/migrations/*zalo*`)

> **Lưu ý**: các file này KHÔNG tự apply — phải chạy tay (SQL editor hoặc `psql $DATABASE_URL -f ...`) trước khi tính năng tương ứng hoạt động (xem `CLAUDE.md`).

| File | Chức năng |
|---|---|
| `2026-07-03_zalo_schema_normalize.sql` | Thêm cột cache UI vào `zalo_groups`/`zalo_messages`; tạo `zalo_conversations_ui` (cache danh sách hội thoại) + `zalo_message_drafts`; RLS permissive cho anon. |
| `2026-07-03_zalo_strip_prefix.sql` | Bỏ prefix `u:`/`g:` legacy khỏi `zalo_conversations_ui.conversation_id` → dùng raw thread id. |
| `2026-07-06_zalo_multi_auth.sql` | Đa tài khoản: bảng `staff`, `zalo_accounts` (mirror `accounts.json`), `staff_zalo_assignments` (RBAC nhân viên ↔ account). |
| `2026-07-09_zalo_forward_rules.sql` | Bảng `zalo_forward_rules`, `zalo_forward_targets`, `zalo_forward_logs` — nền tảng cho `forwardEngine.js`. |
