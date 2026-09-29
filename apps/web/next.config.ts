import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ghusn/db", "@ghusn/core"],
  serverExternalPackages: ["@prisma/client", "sharp"],
  experimental: {
    // صورة واحدة لكل طلب (تُصغَّر في المتصفح أولاً)؛ الحد الأعلى 10MB + هامش multipart
    serverActions: { bodySizeLimit: "11mb" },
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
