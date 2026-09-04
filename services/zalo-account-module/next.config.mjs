/**
 * Standalone "centralized Zalo account management" module.
 *
 * Deploy trên subdomain riêng cùng gốc domain với app chính (vd
 * zalo-accounts.timetech.markeeai.com), publish thẳng port 3002 ra host —
 * KHÔNG dùng basePath/path-prefix nữa (khác thiết kế ban đầu), vì subdomain
 * riêng phục vụ app ở domain root.
 *
 * output để mặc định (undefined, không phải "standalone") giống cách
 * frontend.Dockerfile build app chính: `npm run build` + `npm run start`.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: undefined
};

export default nextConfig;
