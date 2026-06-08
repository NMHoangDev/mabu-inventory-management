import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs", "@google/genai", "pg"],
  turbopack: {
    root
  },
  experimental: {
    proxyClientMaxBodySize: 50 * 1024 * 1024
  }
};

export default nextConfig;
