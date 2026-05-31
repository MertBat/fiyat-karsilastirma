import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb', 'puppeteer-core', '@sparticuz/chromium'],
  experimental: {},
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
