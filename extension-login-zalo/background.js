const REQUIRED_COOKIE_KEYS = ["zpsid"];
const DEFAULT_BACKEND_URL = "http://localhost:8000";
const ZALO_URL = "https://chat.zalo.me/";

// Origins được phép gửi messages tới background (từ manifest content_scripts matches).
// Bao gồm cả extension origin để popup/offscreen page hoạt động.
const ALLOWED_SENDER_ORIGINS = new Set([
  "http://localhost",
  "http://127.0.0.1",
  "https://localhost",
  "https://127.0.0.1",
  "https://auto-fb.zenithglobal.dev",
  "https://seeding.zenithglobal.dev",
  "https://seeding.markeeai.com",
]);

function isTrustedSender(sender) {
  // Messages từ extension popup hoặc offscreen document luôn tin cậy
  if (!sender.tab) return true; // không có tab = từ extension context

  const tabUrl = sender.tab?.url || "";
  if (!tabUrl) return false;

  try {
    const origin = new URL(tabUrl).origin;
    if (ALLOWED_SENDER_ORIGINS.has(origin)) return true;

    // Fallback: cho phép localhost với bất kỳ port nào
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  } catch (_) {
    // URL parse failed
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // B22: Validate sender origin — chặn messages từ tabs không được phép
  // (ví dụ: nếu extension bị inject vào trang ngoài whitelist)
  if (!isTrustedSender(sender)) {
    const senderUrl = sender.tab?.url || "(no tab)";
    console.warn("[zalo-extension] blocked message from untrusted sender:", senderUrl, message?.action);
    sendResponse({ success: false, error: "Sender origin not trusted" });
    return true;
  }

  const action = message?.action || message?.type;
  const data = message?.data || {};

  handleAction(action, data)
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => {
      console.error("[zalo-extension] action failed", action, error);
      sendResponse({
        success: false,
        error: error?.message || String(error || "Unknown extension error"),
      });
    });

  return true;
});

async function handleAction(action, data) {
  switch (action) {
    case "PING":
      return { installed: true };
    case "GET_ZALO_COOKIES":
      return await getZaloCookiesPayload();
    case "CHECK_ZALO_LOGIN":
      return await checkZaloLogin();
    case "IMPORT_ZALO_SESSION":
      return await importZaloSession(data);
    case "SYNC_ZALO_DOM_MESSAGES":
      return await syncZaloDomMessages(data);
    default:
      throw new Error(`Unsupported Zalo extension action: ${action}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chromeLastError() {
  return chrome.runtime.lastError?.message || "";
}

function queryTabs(query) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs) => {
      const err = chromeLastError();
      if (err) reject(new Error(err));
      else resolve(tabs || []);
    });
  });
}

function createTab(url, active) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active }, (tab) => {
      const err = chromeLastError();
      if (err) reject(new Error(err));
      else resolve(tab);
    });
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const err = chromeLastError();
      if (err) reject(new Error(err));
      else resolve(tab);
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chromeLastError();
      if (err) reject(new Error(err));
      else if (response && response.success === false) reject(new Error(response.error || "Content script error"));
      else resolve(response?.data ?? response);
    });
  });
}

function executeContentFile(tabId, file) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: [file],
      },
      (results) => {
        const err = chromeLastError();
        if (err) reject(new Error(err));
        else resolve(results || []);
      },
    );
  });
}

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const done = async () => {
      try {
        const tab = await getTab(tabId);
        if (tab.status === "complete") {
          cleanup();
          resolve(tab);
          return true;
        }
      } catch (error) {
        cleanup();
        reject(error);
        return true;
      }
      return false;
    };

    const cleanup = () => {
      clearInterval(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    };

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve(tab);
      }
    };

    const timer = setInterval(async () => {
      if (Date.now() - startedAt > timeoutMs) {
        cleanup();
        reject(new Error("Timeout waiting for Zalo tab to load"));
        return;
      }
      await done();
    }, 500);

    chrome.tabs.onUpdated.addListener(listener);
    void done();
  });
}

async function findZaloTab() {
  const tabs = await queryTabs({});
  const zaloTabs = tabs.filter((tab) => {
    try {
      if (!tab.url) return false;
      const urlObj = new URL(tab.url);
      const host = urlObj.hostname.toLowerCase();
      return (
        host.includes("zalo.me") ||
        host.includes("zaloapp.com") ||
        host.includes("zalo")
      );
    } catch (_) {
      const url = String(tab.url || "").toLowerCase();
      return url.includes("zalo.me") || url.includes("id.zalo") || url.includes("zaloapp.com") || url.includes("zalo");
    }
  });
  const complete = zaloTabs.find((tab) => tab.status === "complete");
  return complete || zaloTabs[0] || null;
}

let openTabPromise = null;

async function getOrOpenZaloTab({ active = false } = {}) {
  if (openTabPromise) {
    return await openTabPromise;
  }

  openTabPromise = (async () => {
    try {
      const existing = await findZaloTab();
      if (existing?.id) {
        if (existing.status !== "complete") await waitForTabComplete(existing.id, 30000);
        return await getTab(existing.id);
      }
      const tab = await createTab(ZALO_URL, active);
      if (!tab?.id) throw new Error("Cannot open Zalo Web tab");
      await waitForTabComplete(tab.id, 30000);
      return await getTab(tab.id);
    } finally {
      openTabPromise = null;
    }
  })();

  return await openTabPromise;
}

async function ensureZaloContentScript(tabId) {
  try {
    await sendMessageToTab(tabId, { action: "PING_ZALO_CONTENT" });
    return;
  } catch (_error) {
    try {
      await executeContentFile(tabId, "zalo-content.js");
      await wait(250);
      await sendMessageToTab(tabId, { action: "PING_ZALO_CONTENT" });
    } catch (e) {
      console.warn("[zalo-extension] failed to ensure Zalo content script:", e);
    }
  }
}

async function getZaloPageContext(tabId) {
  try {
    await ensureZaloContentScript(tabId);
    return await sendMessageToTab(tabId, { action: "GET_ZALO_CONTEXT" });
  } catch (error) {
    console.warn("[zalo-extension] cannot read Zalo page context", error);
    return {
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      imei: "",
    };
  }
}

function getAllCookies(details) {
  return new Promise((resolve) => {
    chrome.cookies.getAll(details, (cookies) => {
      const err = chromeLastError();
      if (err) {
        console.warn("[zalo-extension] cookie query failed", details, err);
        resolve([]);
      } else {
        resolve(cookies || []);
      }
    });
  });
}

async function readZaloCookies() {
  const queries = [
    { url: "https://chat.zalo.me/" },
    { url: "https://id.zalo.me/" },
    { url: "https://zalo.me/" },
    { domain: "zalo.me" },
    { domain: ".zalo.me" },
    { domain: "chat.zalo.me" },
    { domain: ".chat.zalo.me" },
  ];

  const all = [];
  for (const query of queries) {
    all.push(...(await getAllCookies(query)));
  }

  const byKey = new Map();
  for (const cookie of all) {
    if (!cookie?.name || !String(cookie.domain || "").includes("zalo.me")) continue;
    const key = `${cookie.storeId || ""}|${cookie.name}|${cookie.domain}|${cookie.path || "/"}`;
    byKey.set(key, cookie);
  }

  return [...byKey.values()].map(toBackendCookie);
}

function toBackendCookie(cookie) {
  const item = {
    key: cookie.name,
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || "chat.zalo.me",
    path: cookie.path || "/",
    httpOnly: !!cookie.httpOnly,
    secure: !!cookie.secure,
  };
  if (Number.isFinite(cookie.expirationDate) && cookie.expirationDate > 0) {
    item.expires = Math.floor(cookie.expirationDate);
    item.expirationDate = Math.floor(cookie.expirationDate);
  }
  const sameSite = normalizeSameSite(cookie.sameSite);
  if (sameSite) item.sameSite = sameSite;
  return item;
}

function normalizeSameSite(value) {
  const lower = String(value || "").toLowerCase();
  if (lower === "no_restriction" || lower === "none") return "none";
  if (lower === "lax") return "lax";
  if (lower === "strict") return "strict";
  return undefined;
}

function cookieKeys(cookies) {
  return [...new Set(cookies.map((cookie) => String(cookie.key || cookie.name || "").toLowerCase()).filter(Boolean))].sort();
}

function missingRequiredKeys(keys) {
  const set = new Set(keys.map((key) => key.toLowerCase()));
  return REQUIRED_COOKIE_KEYS.filter((key) => !set.has(key));
}

async function getZaloCookiesPayload(options = {}) {
  let tab = null;
  try {
    if (options.openTab) {
      tab = await getOrOpenZaloTab({ active: !!options.active });
    } else {
      tab = await findZaloTab();
    }
  } catch (e) {
    console.warn("[zalo-extension] failed to get or open Zalo tab:", e);
  }

  const context = tab?.id ? await getZaloPageContext(tab.id) : {};
  const cookies = await readZaloCookies();
  const keys = cookieKeys(cookies);
  const missing = missingRequiredKeys(keys);

  return {
    cookies,
    keys,
    user_agent: context.user_agent || (typeof navigator !== "undefined" ? navigator.userAgent : ""),
    imei: context.imei || "",
    missing,
    is_logged_in: missing.length === 0,
  };
}

async function checkZaloLogin() {
  const payload = await getZaloCookiesPayload();
  return {
    is_logged_in: payload.is_logged_in,
    cookies_count: payload.cookies.length,
    missing: payload.missing,
    keys: payload.keys,
  };
}

let lastZaloTabId = null;

async function waitForLoginCookies(timeoutMs = 35000) {
  const startedAt = Date.now();
  let payload = await getZaloCookiesPayload({ openTab: true, active: true });

  const tab = await findZaloTab();
  if (tab?.id) {
    lastZaloTabId = tab.id;
  }

  while (!payload.is_logged_in && Date.now() - startedAt < timeoutMs) {
    await wait(1500);
    payload = await getZaloCookiesPayload({ openTab: false });
  }

  return payload;
}

function makeEndpoint(baseUrl, path) {
  const base = String(baseUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
  if (base.endsWith("/api/all-platform")) return `${base}${path.replace(/^\/api\/all-platform/, "")}`;
  if (base.endsWith("/api")) return `${base}${path.replace(/^\/api/, "")}`;
  return `${base}${path}`;
}

async function postJson(url, body, apiKey, userId) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (userId) headers["X-User-ID"] = userId;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_error) {
    data = text;
  }

  return { status: response.status, ok: response.ok, data };
}

function backendError(result, fallback) {
  const detail = result?.data?.detail || result?.data?.message || result?.data?.error || result?.data;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail || fallback);
  } catch (_error) {
    return fallback;
  }
}

let importInProgress = false;

async function importZaloSession(data) {
  if (importInProgress) {
    throw new Error("Import already in progress");
  }
  importInProgress = true;
  try {
    const accountId = String(data.account_id || data.user_id || "default").trim() || "default";
    const backendUrl = data.backend_url || DEFAULT_BACKEND_URL;
    const apiKey = data.api_key || "";

    const payload = await waitForLoginCookies(Number(data.login_timeout_ms || 35000));
    if (!payload.is_logged_in) {
      throw new Error(
        `Zalo Web is not logged in or required cookies are missing: ${payload.missing.join(", ")}. Open Zalo Web, finish login, then retry.`,
      );
    }

    // Ghi nhớ tab ID nhưng CHƯA đóng — đợi backend xác nhận OK rồi mới đóng
    const tabIdToClose = lastZaloTabId || (await findZaloTab())?.id;
    lastZaloTabId = null;

    const body = {
      account_id: accountId,
      user_id: data.user_id || accountId,
      owner_id: data.owner_id || accountId,
      cookies: payload.cookies,
      user_agent: payload.user_agent,
    };
    if (payload.imei) body.imei = payload.imei;

    const endpoint = makeEndpoint(backendUrl, "/api/all-platform/zalo/auth/import-session");
    const result = await postJson(endpoint, body, apiKey, accountId);

    if (!result.ok) {
      throw new Error(`Backend import-session failed (${result.status}): ${backendError(result, "unknown error")}`);
    }

    // Đóng tab Zalo SAU KHI backend xác nhận thành công — tránh mất cookies khi backend fail
    if (tabIdToClose) {
      try {
        await chrome.tabs.remove(tabIdToClose);
        console.log("[zalo-extension] auto-closed Zalo Web tab AFTER backend confirmed OK:", tabIdToClose);
      } catch (e) {
        console.warn("[zalo-extension] failed to close tab after sync:", e);
      }
    }

    return {
      status: result.status,
      backend: result.data,
      cookies_count: payload.cookies.length,
      keys: payload.keys,
    };
  } finally {
    importInProgress = false;
  }
}

async function syncZaloDomMessages(data) {
  const accountId = String(data.account_id || data.user_id || "default").trim() || "default";
  const backendUrl = data.backend_url || DEFAULT_BACKEND_URL;
  const apiKey = data.api_key || "";

  const tab = await getOrOpenZaloTab({ active: false });
  if (!tab?.id) throw new Error("Cannot find or open Zalo Web tab");
  await ensureZaloContentScript(tab.id);

  const scraped = await sendMessageToTab(tab.id, {
    action: "SCRAPE_ZALO_DOM_MESSAGES",
    data: {
      conversation_id: data.conversation_id || "",
      limit: Number(data.limit || 50),
      conversation_limit: Number(data.conversation_limit || 10),
    },
  });

  const conversations = Array.isArray(scraped?.conversations) ? scraped.conversations : [];
  if (conversations.length === 0) {
    throw new Error("No Zalo conversations/messages were found in the current Zalo Web DOM.");
  }

  const endpoint = makeEndpoint(backendUrl, "/api/all-platform/zalo/conversations/sync-dom");
  const result = await postJson(
    endpoint,
    {
      account_id: accountId,
      conversations,
    },
    apiKey,
    accountId,
  );

  return {
    status: result.status,
    backend: result.data,
    scraped: {
      conversations_count: conversations.length,
      messages_count: conversations.reduce((sum, item) => sum + (item.messages?.length || 0), 0),
      active_group_id: scraped?.active_group_id || null,
      active_group_name: scraped?.active_group_name || null,
    },
  };
}
