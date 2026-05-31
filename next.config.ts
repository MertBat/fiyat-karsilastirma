import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb', 'puppeteer-core', '@sparticuz/chromium'],
  outputFileTracingIncludes: {
    '/api/scrape': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/cron/daily': ['./node_modules/@sparticuz/chromium/bin/**/*'],
    '/api/debug-scrape': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
