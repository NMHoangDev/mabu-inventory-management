-- ============================================================================
-- 2026-07-03: zalo normalize conversation_id (bỏ prefix g:/u:)
--
-- Mục đích: mọi thread (user + group) đều lưu vào zalo_conversations_ui với
-- conversation_id = thread_id thuần. Không phân biệt user/group ở frontend —
-- chỉ dùng thread_id làm định danh duy nhất. Thread_type vẫn còn trong DB
-- để bridge biết cách gửi zca-js, nhưng UI/UX không phụ thuộc nó.
--
-- Sau migration:
--   - conversation_id = thread_id thuần (vd "956476403552843233")
--   - thread_id không đổi
--   - thread_type vẫn còn (user | group) — bridge dùng để route zca-js
--   - Không cần đổi schema khác.
-- ============================================================================

-- 1) Strip prefix khỏi conversation_id cho row cũ (vd "u:123" → "123")
UPDATE public.zalo_conversations_ui
SET conversation_id = SUBSTRING(conversation_id FROM POSITION(':' IN conversation_id) + 1)
WHERE conversation_id LIKE 'u:%' OR conversation_id LIKE 'g:%';

-- 2) Unique index (account_id, conversation_id) vẫn còn từ migration trước.
--    Không cần recreate vì giá trị conversation_id vẫn unique.

-- 3) Trigger updated_at vẫn hoạt động — không thay đổi.

-- Lưu ý: KHÔNG xóa thread_type. Bridge cần nó để gọi zca-js sendMessage với
-- ThreadType.Group vs ThreadType.User. Tuy nhiên frontend KHÔNG đọc thread_type
-- để phân biệt UI/user/group — chỉ dùng thread_id.