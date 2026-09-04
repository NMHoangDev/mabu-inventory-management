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
  },
  // Forward /api/v1/* to Python backend in dev (no CORS hassle)
  async rewrites() {
    const backendBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8765";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendBase}/api/v1/:path*`
      }
    ];
  },
  async redirects() {
    return [
      { source: "/thong-bao-zalo", destination: "/zalo/chat", permanent: true }
    ];
  }
};

export default nextConfig;
