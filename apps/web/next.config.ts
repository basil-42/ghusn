import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@ghusn/db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
