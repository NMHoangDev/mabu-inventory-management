/**
 * /webhook routes
 *
 * POST /webhook/chatwoot-outgoing
 *   Nhận webhook từ Chatwoot khi agent gửi message → forward sang Zalo.
 *   Payload: Chatwoot message_created event
 *
 * POST /webhook/send-message
 *   Gửi message trực tiếp qua API (dùng từ N8N hoặc tests).
 *   Body: { accountId, threadId, threadType, content, attachmentUrl? }
 */

import { Router } from 'express';
import { sessionManager } from '../services/sessionManager.js';
import { chatwootService } from '../services/chatwootService.js';
import { ThreadType } from 'zca-js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

const TEMP_DIR = '/app/data/temp_attachments';
try {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  // Dọn dẹp các tệp tạm thời còn sót lại từ lần chạy trước khi khởi động
  if (fs.existsSync(TEMP_DIR)) {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    }
    logger.info(`Cleaned up ${files.length} leftover temporary attachment files.`);
  }
} catch (cleanErr) {
  logger.error('Failed to clean up leftover temporary attachments on startup', { err: cleanErr.message });
}

const CHATWOOT_URL = (process.env.CHATWOOT_URL || 'http://chatwoot-rails:3000').replace(/\/$/, '');
const processedOutgoingMessages = new Set();

function cacheProcessedOutgoing(key) {
  if (!key) return false;
  if (processedOutgoingMessages.has(key)) return true;
  processedOutgoingMessages.add(key);
  setTimeout(() => processedOutgoingMessages.delete(key), 120000);
  return false;
}

function getChatwootAccountId(body) {
  return body.account?.id || body.account_id || body.conversation?.account_id || body.conversation?.account?.id;
}

function resolveBridgeSessionAccountId(requestedAccountId, chatwootAccountId, inboxId) {
  const requested = requestedAccountId ? String(requestedAccountId) : '';
  if (requested && sessionManager.getApi(requested)) {
    return requested;
  }

  const sessions = sessionManager.listSessions();
  const normalizedChatwootAccountId = chatwootAccountId ? String(chatwootAccountId) : '';
  const normalizedInboxId = inboxId ? String(inboxId) : '';

  const exactMatch = sessions.find(session =>
    session.status === 'logged_in' &&
    session.isWsConnected &&
    String(session.chatwootAccountId || '') === normalizedChatwootAccountId &&
    String(session.inboxId || '') === normalizedInboxId
  );
  if (exactMatch?.accountId) {
    logger.warn(
      `chatwoot-outgoing: remapped stale zalo_bridge_account_id=${requested || 'empty'} to active session=${exactMatch.accountId} for account=${normalizedChatwootAccountId}, inbox=${normalizedInboxId}`
    );
    return exactMatch.accountId;
  }

  const accountMatch = sessions.find(session =>
    session.status === 'logged_in' &&
    session.isWsConnected &&
    String(session.chatwootAccountId || '') === normalizedChatwootAccountId
  );
  if (accountMatch?.accountId) {
    logger.warn(
      `chatwoot-outgoing: remapped stale zalo_bridge_account_id=${requested || 'empty'} to active account session=${accountMatch.accountId} for account=${normalizedChatwootAccountId}`
    );
    return accountMatch.accountId;
  }

  return requested;
}

async function downloadAttachment(attachment) {
  let url = attachment.data_url || attachment.url;
  if (!url) return null;

  if (url.includes('/rails/active_storage/')) {
    const idx = url.indexOf('/rails/active_storage/');
    url = CHATWOOT_URL + url.substring(idx);
  }

  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(res.data);

    // Trích xuất tên tệp
    let filename = 'file';
    const disposition = res.headers['content-disposition'];
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) filename = match[1];
    } else {
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart && lastPart.includes('.')) filename = lastPart.split('?')[0];
    }

    const tempPath = path.join(TEMP_DIR, `${crypto.randomUUID()}_${filename}`);
    fs.writeFileSync(tempPath, buf);
    return tempPath;
  } catch (err) {
    logger.error('Failed to download Chatwoot outgoing attachment', { url, err: err.message });
    return null;
  }
}

const router = Router();

// ── Chatwoot outgoing webhook ─────────────────────────────────────────────────
router.post('/chatwoot-outgoing', async (req, res) => {
  // Luôn trả 200 ngay để Chatwoot không retry
  res.json({ received: true });

  try {
    const body = req.body;

    // Xử lý event message_updated (ví dụ: gỡ/xóa tin nhắn bên Chatwoot)
    if (body.event === 'message_updated') {
      const chatwootAccountId = getChatwootAccountId(body);
      const msgData = body.conversation?.messages?.[0] || body;
      if (!msgData) return;

      const content = msgData.content || '';
      const isDeletedPlaceholder =
        content === 'This message was deleted' ||
        content === 'Tin nhắn đã bị xoá' ||
        content === 'Tin nhắn này đã bị xóa';

      if (isDeletedPlaceholder) {
        let externalId = msgData.external_id || body.external_id;
        if (!externalId && msgData.id) {
          try {
            externalId = await chatwootService.getMessageSourceIdFromDb(msgData.id);
          } catch (dbErr) {
            logger.error(`Failed to fetch source_id from DB for message ${msgData.id}: ${dbErr.message}`);
          }
        }

        if (!externalId) {
          logger.warn(`chatwoot-outgoing (message_updated): message ${msgData.id} has no external_id, cannot recall`);
          return;
        }

        const convAttrs = body.conversation?.custom_attributes || {};
        const metaSender = body.conversation?.meta?.sender?.custom_attributes || {};
        const zaloUserId = convAttrs.zalo_user_id || metaSender.zalo_user_id;
        const requestedAccountId = convAttrs.zalo_bridge_account_id || metaSender.zalo_bridge_account_id;
        const accountId = resolveBridgeSessionAccountId(
          requestedAccountId,
          chatwootAccountId,
          body.conversation?.inbox_id || body.inbox?.id
        );
        const threadType = convAttrs.thread_type || 'user';

        if (!zaloUserId || !accountId) {
          logger.warn('chatwoot-outgoing (message_updated): missing zalo_user_id or zalo_bridge_account_id');
          return;
        }

        try {
          const api = sessionManager.getApi(accountId);
          if (api) {
            const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
            const isOutgoing = String(msgData.message_type) === '1' || String(msgData.message_type) === 'outgoing';
            const [msgId, cliMsgId] = String(externalId).split(':');
            if (isOutgoing) {
              logger.info(`[${accountId}] Recalling (undo) Zalo message msgId=${msgId} cliMsgId=${cliMsgId || msgId} to thread=${zaloUserId}...`);
              const payload = { msgId: String(msgId), cliMsgId: String(cliMsgId || msgId) };
              await api.undo(payload, zaloUserId, type);
              logger.info(`[${accountId}] Zalo message ${msgId} recalled successfully.`);
            } else {
              const uidFrom = msgData.content_attributes?.zalo_sender_id || body.content_attributes?.zalo_sender_id || zaloUserId;
              logger.info(`[${accountId}] Deleting Zalo message (onlyMe) msgId=${msgId} cliMsgId=${cliMsgId || msgId} to thread=${zaloUserId} from sender=${uidFrom}...`);
              const dest = {
                threadId: zaloUserId,
                type,
                data: {
                  cliMsgId: String(cliMsgId || msgId),
                  msgId: String(msgId),
                  uidFrom: String(uidFrom)
                }
              };
              await api.deleteMessage(dest, true);
              logger.info(`[${accountId}] Zalo message ${msgId} deleted (onlyMe) successfully.`);
            }
          }
        } catch (err) {
          logger.error(`[${accountId}] Failed to process message deletion on Zalo: ${err.message}`);
        }
        return;
      }
      return;
    }

    // Chỉ xử lý event message_created, type=outgoing (agent gửi)
    if (body.event !== 'message_created') return;
    const chatwootAccountId = getChatwootAccountId(body);
    const msgData = body.conversation?.messages?.[0] || body;
    if (!msgData) return;

    // message_type = 1 hoặc 'outgoing'
    const isOutgoing = String(msgData.message_type) === '1' || String(msgData.message_type) === 'outgoing';
    if (!isOutgoing) return;
    if (msgData.private === true || msgData.private === 'true') return; // bỏ qua note nội bộ

    const msgAttrs = msgData.content_attributes || {};
    if (msgAttrs.zalo_imported_from_zalo === true || msgAttrs.zalo_imported_from_zalo === 'true') {
      logger.info(`chatwoot-outgoing: skipped imported Zalo self message=${msgData.id}, conversation=${body.conversation?.id}`);
      return;
    }

    const content = msgData.content;
    const attachments = msgData.attachments || [];

    if (!content?.trim() && attachments.length === 0) return;
    const outgoingKey = `${chatwootAccountId || ''}:${body.conversation?.id || ''}:${msgData.id || ''}`;
    if (msgData.id && cacheProcessedOutgoing(outgoingKey)) {
      logger.info(`chatwoot-outgoing: duplicate webhook ignored for message=${msgData.id}, conversation=${body.conversation?.id}`);
      return;
    }

    // Lấy thông tin Zalo từ custom_attributes của conversation
    const convAttrs = body.conversation?.custom_attributes || {};
    const metaSender = body.conversation?.meta?.sender?.custom_attributes || {};

    const zaloUserId = convAttrs.zalo_user_id || metaSender.zalo_user_id;
    const requestedAccountId = convAttrs.zalo_bridge_account_id || metaSender.zalo_bridge_account_id;
    const accountId = resolveBridgeSessionAccountId(
      requestedAccountId,
      chatwootAccountId,
      body.conversation?.inbox_id || body.inbox?.id
    );
    const threadType = convAttrs.thread_type || 'user'; // 'user' hoặc 'group'

    if (!zaloUserId || !accountId) {
      logger.warn('chatwoot-outgoing: missing zalo_user_id or zalo_bridge_account_id in conversation attrs');
      return;
    }

    // Intercept sticker command: /sticker <stickerId>
    if (content && content.trim().startsWith('/sticker ')) {
      const parts = content.trim().split(' ');
      const stickerId = parseInt(parts[1], 10);
      if (!isNaN(stickerId)) {
        try {
          const api = sessionManager.getApi(accountId);
          if (api) {
            logger.info(`[${accountId}] Fetching details for sticker ${stickerId} to send to ${zaloUserId}...`);
            const stickers = await api.getStickersDetail(stickerId);
            if (stickers && stickers.length > 0) {
              const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
              await api.sendSticker(stickers[0], zaloUserId, type);
              logger.info(`[${accountId}] Sent sticker ${stickerId} to Zalo ${zaloUserId}`);

              // Xóa tin nhắn lệnh chữ /sticker <id> trong Chatwoot để giao diện sạch sẽ
              if (msgData.id && body.conversation?.id) {
                try {
                  const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN || '';
                  if (!chatwootAccountId) {
                    throw new Error('Missing Chatwoot account id for deleting sticker command message');
                  }
                  await axios.delete(
                    `${CHATWOOT_URL}/api/v1/accounts/${chatwootAccountId}/conversations/${body.conversation.id}/messages/${msgData.id}`,
                    { headers: { api_access_token: CHATWOOT_TOKEN } }
                  );
                  logger.info(`Deleted temporary sticker command message ${msgData.id} from Chatwoot`);
                } catch (delErr) {
                  logger.warn(`Failed to delete command message ${msgData.id}: ${delErr.message}`);
                }
              }

              if (body.conversation?.id) {
                chatwootService.updateConversationStatus(chatwootAccountId, body.conversation.id, '🟢 Đang hoạt động').catch(() => {});
              }
              return;
            }
          }
        } catch (err) {
          logger.error(`Failed to send sticker ${stickerId}`, { err: err.message });
        }
      }
    }

    // Tải các tệp đính kèm về thư mục tạm
    let tempPaths = [];
    if (attachments.length > 0) {
      for (const att of attachments) {
        const tempPath = await downloadAttachment(att);
        if (tempPath) tempPaths.push(tempPath);
      }
    }

    try {
      const msgContent = { msg: content || '' };
      if (tempPaths.length > 0) {
        msgContent.attachments = tempPaths;
      }

      const sendResult = await sessionManager.sendMessage(accountId, zaloUserId, threadType, msgContent);
      logger.info(`[${accountId}] Outgoing → Zalo ${zaloUserId}: text="${content?.substring(0, 50) || ''}", attachments=${tempPaths.length}, sendResult=${JSON.stringify(sendResult)}`);

      const zaloMsgId = sendResult?.message?.msgId || sendResult?.attachment?.[0]?.msgId;
      const zaloCliMsgId = sendResult?.message?.cliMsgId || sendResult?.attachment?.[0]?.cliMsgId || msgContent.clientId;
      const compositeId = zaloMsgId ? `${zaloMsgId}:${zaloCliMsgId || zaloMsgId}` : undefined;

      if (zaloMsgId && msgData.id && body.conversation?.id) {
        chatwootService.updateMessageExternalId(body.conversation.id, msgData.id, compositeId).catch(() => {});
      }

      if (body.conversation?.id) {
        chatwootService.updateConversationStatus(chatwootAccountId, body.conversation.id, '🟢 Đang hoạt động').catch(() => {});
      }
    } finally {
      // Dọn dẹp tệp tạm
      for (const tempPath of tempPaths) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
    }
  } catch (err) {
    logger.error('chatwoot-outgoing error', { err: err.message, stack: err.stack, body: req.body });
  }
});

// ── Direct send-message API ───────────────────────────────────────────────────
router.post('/send-message', async (req, res) => {
  try {
    const { accountId, threadId, threadType, content, attachmentUrl, conversationId, messageId } = req.body;
    if (!accountId || !threadId || !content) {
      return res.status(400).json({ error: 'accountId, threadId, content required' });
    }

    const api = sessionManager.getApi(accountId);
    if (!api) return res.status(404).json({ error: 'Session not found or not logged in' });

    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;

    let msgContent = { msg: content };

    // Nếu có file đính kèm
    if (attachmentUrl) {
      msgContent.attachments = [{ url: attachmentUrl }];
    }

    const result = await api.sendMessage(msgContent, threadId, type);
    const zaloMsgId = result?.message?.msgId || result?.attachment?.[0]?.msgId;
    const zaloCliMsgId = result?.message?.cliMsgId || result?.attachment?.[0]?.cliMsgId;
    const compositeId = zaloCliMsgId ? `${zaloMsgId}:${zaloCliMsgId}` : (zaloMsgId ? String(zaloMsgId) : undefined);
    if (zaloMsgId && conversationId && messageId) {
      chatwootService.updateMessageExternalId(conversationId, messageId, compositeId).catch(() => {});
    }

    res.json({ success: true, result });
  } catch (err) {
    logger.error('send-message error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ── Typing event relay ────────────────────────────────────────────────────────
router.post('/typing', async (req, res) => {
  try {
    const { accountId, threadId, threadType } = req.body;
    const api = sessionManager.getApi(accountId);
    if (!api) return res.status(404).json({ error: 'Session not found' });
    const type = threadType === 'group' ? ThreadType.Group : ThreadType.User;
    await api.sendTypingEvent(threadId, type);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
