import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ghusn/db", "@ghusn/core"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
