import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb'],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
