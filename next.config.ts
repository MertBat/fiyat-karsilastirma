import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb', 'puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth'],
  experimental: {},
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
