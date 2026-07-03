# Markee Zalo Login Extension

Load this folder with Chrome Developer Mode:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the `extension-login-zalo` folder.

The dashboard talks to this extension through `window.postMessage` using the
`__zaloExt` protocol implemented in `page-bridge.js`.
