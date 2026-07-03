(() => {
  if (window.__markeeZaloBridgeLoaded) return;
  window.__markeeZaloBridgeLoaded = true;
  window.__zaloExtensionAvailable = true;

  const postResponse = (requestId, success, data, error) => {
    window.postMessage(
      {
        __zaloExt: true,
        type: "RESPONSE",
        requestId,
        success,
        data,
        error,
      },
      "*",
    );
  };

  const postPong = (requestId) => {
    window.postMessage(
      {
        __zaloExt: true,
        type: "PONG",
        requestId,
        installed: true,
        success: true,
        data: { installed: true },
      },
      "*",
    );
  };

  window.addEventListener("message", (event) => {
    // Chỉ nhận message từ chính cửa sổ này (không phải từ iframe khác)
    if (event.source !== window) return;
    // B21: Kiểm tra origin khớp với trang hiện tại — bảo vệ thêm khi
    // page-bridge chạy trong môi trường có cross-origin frames.
    if (event.origin !== window.location.origin) return;
    const payload = event.data;
    if (!payload || payload.__zaloExt !== true || !payload.type) return;

    if (payload.type === "RESPONSE" || payload.type === "PONG") return;

    const requestId = payload.requestId || `zalo-${Date.now()}`;
    if (payload.type === "PING") {
      postPong(requestId);
      return;
    }

    // Guard: nếu background service worker bị unload (MV3 5-minute idle rule),
    // chrome.runtime.sendMessage callback có thể không bao giờ được gọi.
    // Dùng timeout linh hoạt (lên tới 10 phút cho sync DOM) để tránh page bị stuck vĩnh viễn.
    let SEND_TIMEOUT_MS = 60000; // default 60s
    if (payload.type === "SYNC_ZALO_DOM_MESSAGES") {
      SEND_TIMEOUT_MS = 600000; // 10 mins
    } else if (payload.data && typeof payload.data.login_timeout_ms === "number") {
      SEND_TIMEOUT_MS = payload.data.login_timeout_ms + 10000; // login + 10s buffer
    }
    
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      postResponse(requestId, false, null, "Extension message timed out after " + SEND_TIMEOUT_MS + "ms — background service worker may have been unloaded. Please retry.");
    }, SEND_TIMEOUT_MS);

    chrome.runtime.sendMessage(
      {
        action: payload.type,
        type: payload.type,
        data: payload.data || {},
      },
      (response) => {
        if (settled) return; // timeout đã xử lý rồi
        settled = true;
        clearTimeout(timeoutId);
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError) {
          postResponse(requestId, false, null, runtimeError);
          return;
        }
        postResponse(
          requestId,
          !!response?.success,
          response?.data ?? null,
          response?.error || null,
        );
      },
    );
  });

  postPong("bridge-ready");
})();
