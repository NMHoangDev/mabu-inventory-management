/**
 * Custom server: Next.js request handler + worker nền (gửi hàng loạt theo số
 * điện thoại + chiến dịch tự động lặp lịch) chạy trong CÙNG 1 process — mirror
 * đúng pattern đã dùng ở services/zalo-forward-module/server.js.
 *
 * Worker (worker/automationWorker.js) là plain JS (không qua Next.js bundler),
 * khác với phần app/ (Next App Router, TypeScript, được Next tự compile qua
 * handle()).
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { startAutomationWorker } from "./worker/automationWorker.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, host, () => {
    console.log(`[zalo-account-module] Next.js ready on http://${host}:${port}`);
  });

  startAutomationWorker();
});
