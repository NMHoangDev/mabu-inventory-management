# InvoiceFlow Zalo Bridge

Node.js bridge giữa Zalo Personal (`zca-js`) và Chatwoot.

## Chạy local

```bash
cd services/zalo-bridge
npm install
# zca-js được link local (file:./zca-js) và cần cài deps riêng
cd zca-js && npm install --omit=dev && cd ..
npm start
```

Lệnh `npm install` ở root sẽ tạo symlink `node_modules/zca-js` → `zca-js/` nhưng không tự cài deps trong `zca-js/`, nên cần chạy thêm bước `cd zca-js && npm install`.

## Biến môi trường

Xem `.env.example` ở project root:

- `ZALO_BRIDGE_PORT`
- `BRIDGE_API_KEY`
- `CHATWOOT_URL`
- `CHATWOOT_API_TOKEN`
- `ZALO_BRIDGE_PUBLIC_URL`
- `ZALO_EXTENSION_INSTALL_URL`

## Lưu ý

- Session lưu tại `services/zalo-bridge/data/sessions`
- Cần Node.js >= 18
- Nếu deploy cùng Next.js, có thể mount phía sau reverse proxy
