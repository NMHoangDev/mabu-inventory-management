/**
 * Custom server: Next.js request handler + poller nền chạy trong CÙNG 1
 * process (tránh phải thêm 1 Docker image thứ 3 chỉ để chạy worker).
 *
 * Poller (worker/poller.js) là plain JS (không qua Next.js bundler) — mirror
 * đúng phong cách services/zalo-bridge (Node service thuần), khác với phần
 * app/ (Next App Router, TypeScript, được Next tự compile qua handle()).
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { startPoller } from "./worker/poller.js";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3003);
const host = process.env.HOST || "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, host, () => {
    console.log(`[zalo-forward-module] Next.js ready on http://${host}:${port}`);
  });

  startPoller();
});
