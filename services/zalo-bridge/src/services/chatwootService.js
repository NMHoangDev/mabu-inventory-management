/**
 * chatwootService.js
 *
 * Tất cả logic giao tiếp với Chatwoot API:
 *  - Tạo/tìm contact từ Zalo user
 *  - Tạo/tìm conversation
 *  - Gửi incoming message (Zalo → Chatwoot)
 *  - Upload attachment
 */

import axios from 'axios';
import FormData from 'form-data';
import { ThreadType } from 'zca-js';
import { logger } from '../utils/logger.js';
import { updateMessageSourceId, getMessageSourceId } from '../utils/db.js';

const CHATWOOT_URL = (process.env.CHATWOOT_URL || 'http://chatwoot-rails:3000').replace(/\/$/, '');
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN || '';

// Disable Chatwoot integration khi:
// - CHATWOOT_DISABLED=true, hoặc
// - CHATWOOT_API_TOKEN rỗng (chưa config).
// Mặc định: enabled nếu có token.
function chatwootEnabled() {
  if (process.env.CHATWOOT_DISABLED === 'true') return false;
  if (!CHATWOOT_TOKEN) return false;
  return true;
}

function chatwootClient(accountId) {
  if (!accountId) {
    throw new Error('Chatwoot accountId is required');
  }
  if (!chatwootEnabled()) {
    throw new Error('Chatwoot disabled');
  }

  return axios.create({
    baseURL: `${CHATWOOT_URL}/api/v1/accounts/${accountId}`,
    headers: { api_access_token: CHATWOOT_TOKEN, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
}

// Một số flag để module khác check nhanh
export const isChatwootEnabled = chatwootEnabled;

// Key: `${inboxId}:${identifier}` — namespace per inbox để multi-account không lẫn nhau
const contactCache = new Map();

function cacheKey(inboxId, identifier) {
  return `${inboxId}:${identifier}`;
}

// Helper to extract text safely from various data types in Zalo content
function normalizeZaloContent(content) {
  if (typeof content !== 'string') return content;
  const trimmed = content.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return content;
  try {
    return JSON.parse(trimmed);
  } catch {
    return content;
  }
}

function extractText(content) {
  content = normalizeZaloContent(content);
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) return content.map(extractText).filter(Boolean).join(' ');
  if (typeof content === 'object') {
    const paramsText = content.params ? extractText(content.params) : '';
    return content.msg ||
      content.message ||
      content.text ||
      content.title ||
      content.description ||
      content.desc ||
      content.href ||
      content.url ||
      content.link ||
      paramsText ||
      '';
  }
  return '';
}

function buildLinkText(content) {
  const normalized = normalizeZaloContent(content) || {};
  if (typeof normalized === 'string') {
    return /^https?:\/\//i.test(normalized.trim()) ? normalized.trim() : '';
  }
  if (typeof normalized !== 'object') return '';
  const nested = normalized.params ? normalizeZaloContent(normalized.params) : null;
  const source = nested && typeof nested === 'object' ? { ...normalized, ...nested } : normalized;
  const title = source.title || source.name || '';
  const desc = source.description || source.desc || source.summary || '';
  const href = source.href || source.url || source.link || source.canonicalUrl || source.sourceUrl || '';
  const lines = [title, desc, href].map(v => String(v || '').trim()).filter(Boolean);
  return [...new Set(lines)].join('\n');
}

// Helper to format quoted messages
function buildQuotePrefix(quote) {
  if (!quote) return '';
  const sender = quote.fromD || 'Người dùng';

  let text = '';
  if (quote.msg) {
    text = quote.msg;
  } else if (quote.attach) {
    try {
      const attachObj = typeof quote.attach === 'string' ? JSON.parse(quote.attach) : quote.attach;
      text = attachObj?.title || attachObj?.description || '[Đính kèm]';
    } catch {
      text = '[Đính kèm]';
    }
  } else {
    text = '[Trích dẫn]';
  }

  if (text.length > 60) {
    text = text.substring(0, 57) + '...';
  }

  return `↳ Trả lời ${sender}: "${text}"\n───\n`;
}

// ── Contact helpers ───────────────────────────────────────────────────────────
async function syncContact(accountId, inboxId, targetZaloId, identifier, displayName, avatarUrl, isGroup = false) {
  const cw = chatwootClient(accountId);
  let existingContact = null;
  try {
    const res = await cw.get('/contacts/search', {
      params: { q: targetZaloId, include_contacts: true },
    });
    const contacts = res.data?.payload ?? [];
    existingContact = contacts.find(c => c.identifier === identifier);
  } catch (err) {
    logger.error(`Error searching contact for identifier ${identifier}: ${err.message}`);
  }

  const body = {
    name: displayName || (isGroup ? `[Nhóm] ${targetZaloId}` : `Zalo ${targetZaloId}`),
    avatar_url: avatarUrl || '',
    custom_attributes: {
      zalo_user_id: targetZaloId,
      channel: 'zalo_personal',
      is_group: isGroup ? 'true' : 'false'
    },
    additional_attributes: {
      social_profiles: { zalo: targetZaloId },
    },
  };

  if (existingContact) {
    const nameChanged = existingContact.name !== body.name;
    const avatarChanged = existingContact.avatar_url !== body.avatar_url;
    const isGroupAttributeChanged = existingContact.custom_attributes?.is_group !== body.custom_attributes.is_group;

    if (nameChanged || avatarChanged || isGroupAttributeChanged) {
      try {
        const updateRes = await cw.put(`/contacts/${existingContact.id}`, body);
        logger.debug(`Updated contact ${identifier} (${displayName}) due to differences.`);
        const updated = updateRes.data?.payload?.contact ?? updateRes.data?.payload;
        if (updated) contactCache.set(cacheKey(inboxId, identifier), updated);
        return updated;
      } catch (err) {
        logger.error(`Failed to update contact ${existingContact.id}: ${err.message}`);
      }
    }
    contactCache.set(cacheKey(inboxId, identifier), existingContact);
    return existingContact;
  } else {
    try {
      const createBody = {
        inbox_id: inboxId,
        identifier,
        ...body
      };
      const create = await cw.post('/contacts', createBody);
      logger.info(`Created new contact ${identifier} (${displayName})`);
      const created = create.data?.payload?.contact ?? create.data?.payload;
      if (created) contactCache.set(cacheKey(inboxId, identifier), created);
      return created;
    } catch (err) {
      logger.error(`Failed to create contact ${identifier}: ${err.message}`);
      return null;
    }
  }
}

async function findOrCreateContact(accountId, inboxId, targetZaloId, identifier, displayName, avatarUrl, isGroup = false) {
  const cw = chatwootClient(accountId);
  const ck = cacheKey(inboxId, identifier);
  if (contactCache.has(ck)) {
    return contactCache.get(ck);
  }
  // Tìm theo targetZaloId (số Zalo ID cực kỳ unique, tránh bị trôi trang tìm kiếm do trùng prefix zalo_user_ / zalo_group_)
  try {
    const res = await cw.get('/contacts/search', {
      params: { q: targetZaloId, include_contacts: true },
    });
    const contacts = res.data?.payload ?? [];
    const match = contacts.find(c => c.identifier === identifier);
    if (match) {
      contactCache.set(ck, match);
      return match;
    }
  } catch {}

  // Tạo mới
  const body = {
    inbox_id: inboxId,
    name: displayName || (isGroup ? `Zalo Nhóm ${targetZaloId}` : `Zalo ${targetZaloId}`),
    identifier,
    avatar_url: avatarUrl || '',
    custom_attributes: {
      zalo_user_id: targetZaloId,
      channel: 'zalo_personal',
      is_group: isGroup ? 'true' : 'false'
    },
    additional_attributes: {
      social_profiles: { zalo: targetZaloId },
    },
  };
  try {
    const create = await cw.post('/contacts', body);
    const contact = create.data?.payload?.contact ?? create.data?.payload;
    if (contact) {
      contactCache.set(ck, contact);
    }
    return contact;
  } catch (err) {
    logger.error(`Failed to create contact ${identifier}: ${err.message}`);
    return null;
  }
}

// Map to track active conversation IDs per account: accountId -> Set of conversationIds
const activeConversationsByAccount = new Map();

function trackConversation(accountId, conversationId) {
  if (!accountId || !conversationId) return;
  if (!activeConversationsByAccount.has(accountId)) {
    activeConversationsByAccount.set(accountId, new Set());
  }
  activeConversationsByAccount.get(accountId).add(conversationId);
}

function clearActiveConversations(accountId) {
  activeConversationsByAccount.delete(accountId);
}

// Tìm conversation hiện có cho 1 thread, KHÔNG tạo mới (dùng cho undo/recall)
async function findExistingConversation(accountId, inboxId, targetZaloId, isGroup = false) {
  const cw = chatwootClient(accountId);
  const identifier = isGroup ? `zalo_group_${targetZaloId}` : `zalo_user_${targetZaloId}`;
  const ck = cacheKey(inboxId, identifier);
  let contact = contactCache.get(ck);
  if (!contact) {
    try {
      const res = await cw.get('/contacts/search', {
        params: { q: targetZaloId, include_contacts: true },
      });
      const contacts = res.data?.payload ?? [];
      contact = contacts.find(c => c.identifier === identifier);
      if (contact) contactCache.set(ck, contact);
    } catch {}
  }
  if (!contact?.id) return null;

  try {
    const res = await cw.get(`/contacts/${contact.id}/conversations`);
    const convs = res.data?.payload ?? [];
    return convs.find(c =>
      c.inbox_id?.toString() === inboxId?.toString() &&
      ['open', 'pending'].includes(c.status)
    ) || null;
  } catch {
    return null;
  }
}

// ── Conversation helpers ──────────────────────────────────────────────────────
async function findOrCreateConversation(inboxId, contactId, targetZaloId, accountId, isGroup = false) {
  const cw = chatwootClient(accountId);
  // Tìm conversation open
  try {
    const res = await cw.get(`/contacts/${contactId}/conversations`);
    const convs = res.data?.payload ?? [];
    const open = convs.find(c =>
      c.inbox_id?.toString() === inboxId?.toString() &&
      ['open', 'pending'].includes(c.status)
    );
    if (open) {
      trackConversation(accountId, open.id);
      return open;
    }
  } catch {}

  // Tạo mới
  const body = {
    inbox_id: inboxId,
    contact_id: contactId,
    status: 'open',
    custom_attributes: {
      zalo_user_id: targetZaloId,
      zalo_bridge_account_id: accountId,
      channel: 'zalo_personal',
      thread_type: isGroup ? 'group' : 'user'
    },
  };
  const create = await cw.post('/conversations', body);
  const conv = create.data?.payload ?? create.data;
  if (conv?.id) {
    trackConversation(accountId, conv.id);
  }
  return conv;
}

async function updateConversationStatus(accountId, conversationId, statusText) {
  const cw = chatwootClient(accountId);
  try {
    await cw.put(`/conversations/${conversationId}`, {
      custom_attributes: {
        zalo_status: statusText
      }
    });
  } catch (err) {
    logger.error(`Failed to update conversation status for ${conversationId}`, { err: err.message });
  }
}

// ── Upload attachment (public URL hoặc buffer) ────────────────────────────────
function zaloContentAttributes(zaloSenderId, importedFromZalo = false) {
  return {
    zalo_sender_id: zaloSenderId ? String(zaloSenderId) : undefined,
    zalo_imported_from_zalo: importedFromZalo ? 'true' : undefined,
  };
}

async function uploadAttachmentUrl(accountId, conversationId, url, filename, messageType = 'incoming', zaloMsgId = null, caption = '', zaloSenderId = null, importedFromZalo = false) {
  try {
    // Fetch file từ Zalo CDN
    const fileRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
    const buf = Buffer.from(fileRes.data);
    const fd = new FormData();
    fd.append('attachments[]', buf, { filename: filename || 'attachment', contentType: fileRes.headers['content-type'] });
    fd.append('message_type', messageType);
    fd.append('content', caption || '');
    if (zaloMsgId) {
      fd.append('external_id', String(zaloMsgId));
    }
    if (zaloSenderId) {
      fd.append('content_attributes[zalo_sender_id]', String(zaloSenderId));
    }
    if (importedFromZalo) {
      fd.append('content_attributes[zalo_imported_from_zalo]', 'true');
    }
    const uploadRes = await axios.post(
      `${CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      fd,
      {
        headers: { ...fd.getHeaders(), api_access_token: CHATWOOT_TOKEN },
        timeout: 30000,
      }
    );
    return uploadRes.data;
  } catch (err) {
    logger.error('uploadAttachmentUrl failed', { url, err: err.message });
    return null;
  }
}

// ── Main incoming handler ─────────────────────────────────────────────────────
export const chatwootService = {
  /**
   * Xử lý tin nhắn đến từ Zalo → đẩy vào Chatwoot.
   * @param {string} accountId  - Zalo bridge account ID
   * @param {string} inboxId    - Chatwoot inbox ID
   * @param {object} msg        - zca-js message object (UserMessage | GroupMessage)
   * @param {object} api        - zca-js API instance
   * @param {boolean} isSelf    - true nếu tin nhắn do chính mình gửi từ điện thoại
   */
  async handleIncomingMessage(accountId, inboxId, msg, api, isSelf = false) {
    const cw = chatwootClient(accountId);
    const { data, threadId, type } = msg;
    const isGroup = type === ThreadType.Group;
    const zaloUserId = data.uidFrom;
    const messageType = isSelf ? 'outgoing' : 'incoming';
    const zaloMsgIds = [data.msgId, data.cliMsgId, data.globalMsgId, data.msgID, data.id]
      .filter(id => id !== undefined && id !== null && id !== '')
      .map(String);
    const zaloMsgId = zaloMsgIds[0];
    const zaloExternalId = data.msgId && data.cliMsgId
      ? `${data.msgId}:${data.cliMsgId}`
      : (zaloMsgId ? String(zaloMsgId) : undefined);
    const personalThreadId = threadId || (isSelf ? data.idTo : data.uidFrom) || data.idTo || data.uidFrom;

    // Xác định thông tin contact & conversation dựa trên cá nhân hay nhóm
    let displayName = data.dName || `Zalo ${personalThreadId}`;
    let avatarUrl = '';
    let targetZaloId;
    let identifier;

    if (isGroup) {
      targetZaloId = threadId; // Group ID
      identifier = `zalo_group_${threadId}`;
      try {
        const groupInfoRes = await api.getGroupInfo(threadId);
        const groupInfo = groupInfoRes?.gridInfoMap?.[threadId];
        displayName = groupInfo?.name ? `[Nhóm] ${groupInfo.name}` : `[Nhóm] Zalo Nhóm ${threadId}`;
        avatarUrl = groupInfo?.avt || groupInfo?.fullAvt || '';
      } catch {
        displayName = `[Nhóm] Zalo Nhóm ${threadId}`;
      }
    } else {
      targetZaloId = personalThreadId;
      identifier = `zalo_user_${targetZaloId}`;
      try {
        const userInfo = await api.getUserInfo(targetZaloId);
        displayName = userInfo?.name || displayName;
        avatarUrl = userInfo?.avatar || '';
      } catch {}
    }

    // Tìm/tạo contact & conversation
    const contact = await findOrCreateContact(accountId, inboxId, targetZaloId, identifier, displayName, avatarUrl, isGroup);
    const contactId = contact?.id;
    if (!contactId) {
      logger.error(`Cannot get contact id for zalo target ${targetZaloId}`);
      return;
    }

    const conversation = await findOrCreateConversation(inboxId, contactId, targetZaloId, accountId, isGroup);
    const conversationId = conversation?.id;
    if (!conversationId) {
      logger.error(`Cannot get conversation for contact ${contactId}`);
      return;
    }
    await updateConversationStatus(accountId, conversationId, '🟢 Đang hoạt động');

    // Đảm bảo hội thoại luôn ở trạng thái 'open' để hiển thị ở sidebar
    if (conversation && conversation.status !== 'open') {
      try {
        await cw.put(`/conversations/${conversationId}`, { status: 'open' });
        logger.debug(`Reopened resolved/pending conversation ${conversationId}`);
      } catch (e) {
        logger.error(`Failed to reopen conversation ${conversationId}: ${e.message}`);
      }
    }

    // Deduplication check: check if message with zaloMsgId already exists in Chatwoot
    if (zaloMsgId) {
      try {
        const cwMessages = await this.getMessages(accountId, conversationId);
        const isDuplicate = cwMessages.some(m => {
          if (!m.external_id) return false;
          const extIdStr = String(m.external_id);
          const extParts = extIdStr.split(':').filter(Boolean);
          if (zaloMsgIds.some(id => extIdStr === id || extParts.includes(id))) return true;
          if (zaloMsgIds.some(id => extIdStr.length >= 15 && id.length >= 15 && extIdStr.substring(0, 15) === id.substring(0, 15))) return true;
          return false;
        });
        if (isDuplicate) {
          logger.info(`[${accountId}] Duplicate message ${zaloMsgId} ignored for conversation ${conversationId}`);
          return;
        }
      } catch (err) {
        logger.error(`[${accountId}] Failed to deduplicate message ${zaloMsgId}: ${err.message}`);
      }
    }

    const msgType = data.msgType;
    const senderName = data.dName || data.uidFrom || 'Thành viên';

    // Format quoted/reply message context if present
    const quotePrefix = buildQuotePrefix(data.quote);

    // Xây dựng caption cho các tin nhắn đính kèm file/ảnh/video
    const desc = data.content?.desc || data.content?.description || '';
    let caption = isGroup
      ? (desc ? `[${senderName}]: ${desc}` : `[${senderName}]`)
      : desc;
    if (quotePrefix) {
      caption = quotePrefix + (caption || '');
    }

    // ── Text ──────────────────────────────────────────────────────────────────
    const extractedContent = extractText(data.content);
    if (extractedContent && (msgType === 'webchat' || msgType === '1' || !msgType)) {
      const finalContent = quotePrefix + extractedContent;
      const formattedContent = isGroup ? `[${senderName}]: ${finalContent}` : finalContent;
      await cw.post(`/conversations/${conversationId}/messages`, {
        content: formattedContent,
        message_type: messageType,
        content_type: 'text',
        private: false,
        external_id: zaloExternalId,
        content_attributes: zaloContentAttributes(zaloUserId, isSelf)
      });
      logger.info(`[${accountId}] Text message (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Photo ─────────────────────────────────────────────────────────────────
    if (msgType === 'chat.photo' && data.content?.href) {
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, 'photo.jpg', messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] Photo (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Doodle ────────────────────────────────────────────────────────────────
    if (msgType === 'chat.doodle' && data.content?.href) {
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, 'doodle.jpg', messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] Doodle (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Voice Message ─────────────────────────────────────────────────────────
    if (msgType === 'chat.voice' && data.content?.href) {
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, 'voice.m4a', messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] Voice message (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── GIF ───────────────────────────────────────────────────────────────────
    if (msgType === 'chat.gif' && data.content?.href) {
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, 'image.gif', messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] GIF (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Video ─────────────────────────────────────────────────────────────────
    if (msgType === 'chat.video.msg' && data.content?.href) {
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, 'video.mp4', messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] Video (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Location ──────────────────────────────────────────────────────────────
    if (msgType === 'chat.location.new' && data.content) {
      const lat = data.content.lat;
      const lon = data.content.lon;
      const addressDesc = data.content.desc || data.content.address || 'Vị trí';

      let textContent = `[Vị trí] ${addressDesc}`;
      if (lat && lon) {
        textContent += `\nhttps://www.google.com/maps?q=${lat},${lon}`;
      }

      const finalContent = quotePrefix + textContent;
      const formattedContent = isGroup ? `[${senderName}]: ${finalContent}` : finalContent;
      await cw.post(`/conversations/${conversationId}/messages`, {
        content: formattedContent,
        message_type: messageType,
        content_type: 'text',
        private: false,
        external_id: zaloExternalId,
        content_attributes: zaloContentAttributes(zaloUserId, isSelf)
      });
      logger.info(`[${accountId}] Location (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── File ──────────────────────────────────────────────────────────────────
    if (msgType === 'share.file' && data.content?.href) {
      const filename = data.content?.title || 'file';
      await uploadAttachmentUrl(accountId, conversationId, data.content.href, filename, messageType, zaloExternalId, caption, zaloUserId, isSelf);
      logger.info(`[${accountId}] File (${messageType}) → conversation ${conversationId}`);
      return;
    }

    // ── Sticker ───────────────────────────────────────────────────────────────
    if (msgType === 'chat.sticker') {
      if (data.content?.id) {
        try {
          const stickers = await api.getStickersDetail(data.content.id);
          const stickerUrl = stickers?.[0]?.stickerUrl || stickers?.[0]?.stickerWebpUrl || '';
          if (stickerUrl) {
            await uploadAttachmentUrl(accountId, conversationId, stickerUrl, `sticker_${data.content.id}.png`, messageType, zaloExternalId, caption || '[Sticker]', zaloUserId, isSelf);
            logger.info(`[${accountId}] Sticker (${messageType}) → conversation ${conversationId}`);
            return;
          }
        } catch (stickerErr) {
          logger.error(`Failed to fetch sticker details for id ${data.content.id}`, { err: stickerErr.message });
        }
      }

      const defaultText = '[Sticker]';
      const finalContent = quotePrefix + defaultText;
      const formattedContent = isGroup ? `[${senderName}]: ${finalContent}` : finalContent;
      await cw.post(`/conversations/${conversationId}/messages`, {
        content: formattedContent,
        message_type: messageType,
        content_type: 'text',
        private: false,
        external_id: zaloExternalId,
        content_attributes: zaloContentAttributes(zaloUserId, isSelf)
      });
      return;
    }

    // ── Link/card ─────────────────────────────────────────────────────────────
    const linkText = buildLinkText(data.content);
    if ((msgType === 'chat.recommended' || msgType === 'chat.link' || linkText) && linkText) {
      const text = linkText;
      const finalContent = quotePrefix + text;
      const formattedContent = isGroup ? `[${senderName}]: ${finalContent}` : finalContent;
      await cw.post(`/conversations/${conversationId}/messages`, {
        content: formattedContent,
        message_type: messageType,
        content_type: 'text',
        private: false,
        external_id: zaloExternalId,
        content_attributes: zaloContentAttributes(zaloUserId, isSelf)
      });
      logger.info(`[${accountId}] Link/card (${messageType}) â†’ conversation ${conversationId}`);
      return;
    }

    // Fallback: gửi content dạng JSON string để không mất dữ liệu
    const text = `[${msgType}] ${JSON.stringify(data.content)}`.substring(0, 2000);
    const finalContent = quotePrefix + text;
    const formattedContent = isGroup ? `[${senderName}]: ${finalContent}` : finalContent;
    await cw.post(`/conversations/${conversationId}/messages`, {
      content: formattedContent,
      message_type: messageType,
      content_type: 'text',
      private: false,
      external_id: zaloExternalId,
      content_attributes: zaloContentAttributes(zaloUserId, isSelf)
    });

  },

  /**
   * Xử lý khi có sự kiện thu hồi tin nhắn bên Zalo.
   */
  async handleIncomingUndo(accountId, inboxId, undoData, api) {
    const cw = chatwootClient(accountId);
    logger.info(`[${accountId}] Received Zalo undo event: ${JSON.stringify(undoData)}`);
    const { data, threadId, isGroup } = undoData;
    const recalledMsgId = data.content?.globalMsgId || data.content?.cliMsgId || data.content?.deleteMsg;
    if (!recalledMsgId) {
      logger.warn(`[${accountId}] Zalo undo event msg has no deleteMsg/cliMsgId/globalMsgId`);
      return;
    }

    // Bug 6 fix: Chỉ TÌM conversation hiện có, KHÔNG tạo mới (tránh tạo contact với tên giả)
    const conversation = await findExistingConversation(accountId, inboxId, threadId, isGroup);
    const conversationId = conversation?.id;
    if (!conversationId) {
      logger.warn(`[${accountId}] Undo: no existing conversation found for thread ${threadId}, skipping.`);
      return;
    }
    await updateConversationStatus(accountId, conversationId, '🟢 Đang hoạt động');

    // Đảm bảo hội thoại luôn ở trạng thái 'open' để hiển thị ở sidebar
    if (conversation && conversation.status !== 'open') {
      try {
        await cw.put(`/conversations/${conversationId}`, { status: 'open' });
      } catch (e) {}
    }

    // Lấy tin nhắn trên Chatwoot để tìm ID tương ứng
    const cwMessages = await this.getMessages(accountId, conversationId);

    // Tìm tin nhắn khớp chính xác ID, hoặc khớp 15 chữ số đầu (tránh lỗi Javascript mất độ chính xác với số lớn 64-bit)
    const targetMsg = cwMessages.find(m => {
      if (!m.external_id) return false;
      const extIdStr = String(m.external_id);
      const parts = extIdStr.split(':');
      const extMsgId = parts[0];
      const extCliMsgId = parts[1] || parts[0];

      const recalledIdStr = String(recalledMsgId);
      const cliMsgIdStr = data.content?.cliMsgId ? String(data.content.cliMsgId) : null;
      const globalMsgIdStr = data.content?.globalMsgId ? String(data.content.globalMsgId) : null;

      // 1. Khớp chính xác hoặc khớp dự phòng qua globalMsgId/cliMsgId
      if (extMsgId === recalledIdStr || extMsgId === globalMsgIdStr) return true;
      if (extCliMsgId === recalledIdStr || (cliMsgIdStr && extCliMsgId === cliMsgIdStr)) return true;
      if (extIdStr === recalledIdStr) return true;

      // 2. Khớp qua 15 chữ số đầu cho số lớn
      if (extMsgId.length >= 15 && recalledIdStr.length >= 15) {
        if (extMsgId.substring(0, 15) === recalledIdStr.substring(0, 15)) return true;
      }
      if (extCliMsgId.length >= 15 && recalledIdStr.length >= 15) {
        if (extCliMsgId.substring(0, 15) === recalledIdStr.substring(0, 15)) return true;
      }

      return false;
    });

    if (targetMsg?.id) {
      try {
        // Thử xóa tin nhắn
        await cw.delete(`/conversations/${conversationId}/messages/${targetMsg.id}`);
        logger.info(`[${accountId}] Recalled message ${recalledMsgId} deleted from Chatwoot conv ${conversationId}`);
      } catch (err) {
        logger.error(`Failed to delete recalled message, falling back to update`, { err: err.message });
        try {
          // Fallback: cập nhật nội dung thành thông báo thu hồi
          await cw.put(`/conversations/${conversationId}/messages/${targetMsg.id}`, {
            content: '[Tin nhắn đã thu hồi]'
          });
        } catch (updateErr) {
          logger.error(`Failed to update recalled message fallback`, { err: updateErr.message });
        }
      }
    } else {
      logger.warn(`[${accountId}] Could not find message to delete in Chatwoot with recalledMsgId=${recalledMsgId} in conv=${conversationId}`);
    }
  },

  /**
   * Xử lý khi có trạng thái soạn tin từ Zalo.
   */
  async handleIncomingTyping(accountId, inboxId, typingData, api) {
    const cw = chatwootClient(accountId);
    const { threadId, type } = typingData;
    const isGroup = type === ThreadType.Group;

    const displayName = isGroup ? `Zalo Nhóm ${threadId}` : `Zalo ${threadId}`;
    const conversation = await this.getOrCreateConversationForZaloUser(accountId, inboxId, threadId, displayName, isGroup);
    const conversationId = conversation?.id;
    if (!conversationId) return;
    await updateConversationStatus(accountId, conversationId, '🟢 Đang hoạt động');

    try {
      await cw.post(`/conversations/${conversationId}/toggle_typing_status`, {
        typing_status: 'on'
      });
      logger.info(`[${accountId}] Typing status ON for conversation ${conversationId}`);
    } catch (err) {
      logger.error('Failed to toggle typing status in Chatwoot', { err: err.message });
    }
  },

  /**
   * Lấy danh sách tin nhắn hiện tại của một hội thoại trong Chatwoot.
   */
  async getMessages(accountId, conversationId) {
    const cw = chatwootClient(accountId);
    try {
      const res = await cw.get(`/conversations/${conversationId}/messages`);
      return res.data?.payload || [];
    } catch (err) {
      logger.error(`Failed to get Chatwoot messages for conversation ${conversationId}`, { err: err.message });
      return [];
    }
  },

  /**
   * Lấy hoặc tạo hội thoại Chatwoot cho một Zalo user/group.
   */
  async getOrCreateConversationForZaloUser(accountId, inboxId, zaloUserId, displayName, isGroup = false) {
    const identifier = isGroup ? `zalo_group_${zaloUserId}` : `zalo_user_${zaloUserId}`;
    const contact = await findOrCreateContact(accountId, inboxId, zaloUserId, identifier, displayName || `Zalo ${zaloUserId}`, '', isGroup);
    if (!contact?.id) return null;
    const conversation = await findOrCreateConversation(inboxId, contact.id, zaloUserId, accountId, isGroup);
    return conversation;
  },

  /**
   * Gửi tin nhắn outgoing từ Chatwoot → Zalo.
   * Được gọi từ route /webhook/chatwoot-outgoing.
   */
  async sendToZalo(sessionManager, accountId, zaloUserId, threadType, content) {
    return sessionManager.sendMessage(accountId, zaloUserId, threadType, { msg: content });
  },

  async updateConversationStatus(accountId, conversationId, statusText) {
    return updateConversationStatus(accountId, conversationId, statusText);
  },

  async syncAllZaloContacts(accountId, api, inboxId) {
    if (!inboxId) {
      logger.warn(`[${accountId}] Skip syncAllZaloContacts: no inboxId provided.`);
      return;
    }
    logger.info(`[${accountId}] Starting Zalo contacts synchronization (inboxId=${inboxId})...`);
    try {
      // 1. Đồng bộ bạn bè (Friends) với cơ chế thử lại nếu lỗi (do kết nối mới thiết lập chưa ổn định)
      let friends = [];
      let friendsRetries = 3;
      while (friendsRetries > 0) {
        try {
          friends = await api.getAllFriends();
          logger.info(`[${accountId}] Fetched ${friends.length} friends from Zalo.`);
          break;
        } catch (err) {
          friendsRetries--;
          logger.warn(`[${accountId}] Failed to fetch friends (attempts left: ${friendsRetries}): ${err.message}`);
          if (friendsRetries > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            logger.error(`[${accountId}] Failed to fetch friends after all attempts.`);
          }
        }
      }

      for (const friend of friends) {
        const identifier = `zalo_user_${friend.userId}`;
        const name = friend.displayName || friend.zaloName;
        try {
          await syncContact(accountId, inboxId, friend.userId, identifier, name, friend.avatar, false);
        } catch (contactErr) {
          logger.debug(`[${accountId}] syncContact friend skipped: ${contactErr.message}`);
        }

        // Tạo/tìm conversation để bạn bè hiển thị trực tiếp ở sidebar (Conversation List)
        try {
          await this.getOrCreateConversationForZaloUser(accountId, inboxId, friend.userId, name, false);
        } catch (convErr) {
          logger.error(`[${accountId}] Failed to create/resolve conversation for friend ${friend.userId}: ${convErr.message}`);
        }
      }

      // 2. Đồng bộ nhóm (Groups) với cơ chế thử lại nếu lỗi
      let groupIds = [];
      let groupsRetries = 3;
      while (groupsRetries > 0) {
        try {
          const groupsRes = await api.getAllGroups();
          const ids = new Set();
          if (groupsRes) {
            if (groupsRes.gridVerMap) {
              Object.keys(groupsRes.gridVerMap).forEach(id => ids.add(String(id)));
            }
            if (groupsRes.gridInfoMap) {
              Object.keys(groupsRes.gridInfoMap).forEach(id => ids.add(String(id)));
            }
            const arrayKeys = ["groups", "data", "items", "list"];
            for (const key of arrayKeys) {
              if (Array.isArray(groupsRes[key])) {
                for (const item of groupsRes[key]) {
                  if (typeof item === 'string' || typeof item === 'number') {
                    ids.add(String(item));
                  } else if (item && typeof item === 'object') {
                    const id = item.groupId || item.grid || item.id || item.threadId;
                    if (id) ids.add(String(id));
                  }
                }
              }
            }
          }
          groupIds = Array.from(ids);
          logger.info(`[${accountId}] Fetched ${groupIds.length} group IDs from Zalo.`);
          break;
        } catch (err) {
          groupsRetries--;
          logger.warn(`[${accountId}] Failed to fetch groups (attempts left: ${groupsRetries}): ${err.message}`);
          if (groupsRetries > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            logger.error(`[${accountId}] Failed to fetch groups after all attempts.`);
          }
        }
      }

      if (groupIds.length > 0) {
        const chunks = [];
        const chunkSize = 50;
        for (let i = 0; i < groupIds.length; i += chunkSize) {
          chunks.push(groupIds.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
          try {
            const groupInfoRes = await api.getGroupInfo(chunk);
            const gridInfoMap = groupInfoRes?.gridInfoMap ?? {};
            for (const gId of chunk) {
              const groupInfo = gridInfoMap[gId];
              if (groupInfo) {
                const identifier = `zalo_group_${gId}`;
                const displayName = `[Nhóm] ${groupInfo.name}`;
                const avatarUrl = groupInfo.avt || groupInfo.fullAvt || '';
                await syncContact(accountId, inboxId, gId, identifier, displayName, avatarUrl, true);

                // Tạo/tìm conversation để nhóm hiển thị trực tiếp ở sidebar (Conversation List)
                try {
                  await this.getOrCreateConversationForZaloUser(accountId, inboxId, gId, displayName, true);
                } catch (convErr) {
                  logger.error(`[${accountId}] Failed to create/resolve conversation for group ${gId}: ${convErr.message}`);
                }
              }
            }
          } catch (err) {
            logger.error(`[${accountId}] Failed to fetch group details for chunk: ${err.message}`);
          }
        }
      }

      // 3. Đồng bộ các hội thoại gần đây (Recent conversations - cả group và cá nhân để lấy các tin nhắn / cuộc trò chuyện chưa có trong danh bạ)
      try {
        const recentRes = await api.getCMRecent(100);
        const recentConvs = recentRes?.conversations || [];
        logger.info(`[${accountId}] Fetched ${recentConvs.length} recent conversations for ad-hoc syncing.`);
        for (const conv of recentConvs) {
          const threadId = conv.threadId;
          const isGroup = conv.type === 2; // type=2 là group, 1 là cá nhân
          const identifier = isGroup ? `zalo_group_${threadId}` : `zalo_user_${threadId}`;

          let displayName = isGroup ? `[Nhóm] Zalo Nhóm ${threadId}` : `Zalo ${threadId}`;
          let avatarUrl = '';

          // Lấy thông tin bổ sung để hiển thị đẹp mắt
          if (isGroup) {
            try {
              const groupInfoRes = await api.getGroupInfo([threadId]);
              const groupInfo = groupInfoRes?.gridInfoMap?.[threadId];
              if (groupInfo?.name) {
                displayName = `[Nhóm] ${groupInfo.name}`;
                avatarUrl = groupInfo.avt || groupInfo.fullAvt || '';
              }
            } catch {}
          } else {
            try {
              const userInfo = await api.getUserInfo(threadId);
              if (userInfo?.name) {
                displayName = userInfo.name;
                avatarUrl = userInfo.avatar || '';
              }
            } catch {}
          }

          await syncContact(accountId, inboxId, threadId, identifier, displayName, avatarUrl, isGroup);
          try {
            await this.getOrCreateConversationForZaloUser(accountId, inboxId, threadId, displayName, isGroup);
          } catch (convErr) {
            logger.error(`[${accountId}] Failed to create/resolve conversation for recent thread ${threadId}: ${convErr.message}`);
          }
        }
      } catch (recentErr) {
        logger.error(`[${accountId}] Failed to sync recent conversations: ${recentErr.message}`);
      }

      logger.info(`[${accountId}] Zalo contacts synchronization completed.`);
    } catch (err) {
      logger.error(`[${accountId}] syncAllZaloContacts encountered error: ${err.message}`);
    }
  },

  async handleIncomingGroupEvent(accountId, inboxId, eventData, api) {
    const cw = chatwootClient(accountId);
    const { type, data, threadId } = eventData;
    const isGroup = true;

    const interestedTypes = ['join', 'leave', 'remove_member'];
    if (!interestedTypes.includes(type)) return;

    const groupName = data.groupName || `Zalo Nhóm ${threadId}`;
    const conversation = await this.getOrCreateConversationForZaloUser(accountId, inboxId, threadId, `[Nhóm] ${groupName}`, isGroup);
    const conversationId = conversation?.id;
    if (!conversationId) return;

    const actorId = data.creatorId;
    let actorName = 'Quản trị viên';
    try {
      if (actorId) {
        const actorInfo = await api.getUserInfo(actorId);
        actorName = actorInfo?.name || actorName;
      }
    } catch {}

    const memberNames = [];
    if (data.updateMembers && data.updateMembers.length > 0) {
      for (const m of data.updateMembers) {
        memberNames.push(m.dName || m.id);
      }
    }

    let alertText = '';
    if (type === 'join') {
      alertText = memberNames.length > 0
        ? `[Hệ thống] ${memberNames.join(', ')} đã tham gia nhóm.`
        : `[Hệ thống] Thành viên mới đã tham gia nhóm.`;
    } else if (type === 'leave') {
      alertText = memberNames.length > 0
        ? `[Hệ thống] ${memberNames.join(', ')} đã rời nhóm.`
        : `[Hệ thống] Thành viên đã rời nhóm.`;
    } else if (type === 'remove_member') {
      alertText = memberNames.length > 0
        ? `[Hệ thống] ${actorName} đã xóa ${memberNames.join(', ')} khỏi nhóm.`
        : `[Hệ thống] Thành viên đã bị xóa khỏi nhóm.`;
    }

    if (alertText) {
      await cw.post(`/conversations/${conversationId}/messages`, {
        content: alertText,
        message_type: 'incoming',
        content_type: 'text',
        private: true,
      });
      logger.info(`[${accountId}] Group event (${type}) posted to conversation ${conversationId}`);
    }
  },

  async updateAllConversationsStatus(accountId, statusText) {
    const convIds = activeConversationsByAccount.get(accountId);
    if (!convIds || convIds.size === 0) return;
    logger.info(`[${accountId}] Updating status of ${convIds.size} tracked conversations to: ${statusText}`);
    for (const convId of convIds) {
      try {
        await updateConversationStatus(accountId, convId, statusText);
      } catch (err) {
        logger.error(`Failed to update status for conversation ${convId}: ${err.message}`);
      }
    }
  },

  async updateMessageExternalId(conversationId, messageId, externalId) {
    return updateMessageSourceId(messageId, externalId);
  },

  async getMessageSourceIdFromDb(messageId) {
    return getMessageSourceId(messageId);
  },

  // Bug 2 fix: Dọn dẹp tracked conversations khi destroy session
  clearActiveConversations(accountId) {
    clearActiveConversations(accountId);
  },
};
