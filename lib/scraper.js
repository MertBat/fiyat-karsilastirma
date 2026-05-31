import * as cheerio from 'cheerio';
import db from './db.js';

const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

let cachedBrowser = null;

async function getBrowser() {
  if (cachedBrowser && cachedBrowser.isConnected()) return cachedBrowser;

  const puppeteer = (await import('puppeteer-core')).default;

  if (isServerless) {
    const chromium = (await import('@sparticuz/chromium')).default;
    cachedBrowser = await puppeteer.launch({
      args: [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
        '--lang=tr-TR',
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } else {
    const fs = await import('fs');
    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean);

    const executablePath = candidates.find((p) => {
      try { return fs.existsSync(p); } catch { return false; }
    });

    cachedBrowser = await puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--lang=tr-TR',
      ],
    });
  }

  return cachedBrowser;
}

async function fetchHtml(url, { waitForSelector } = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    });
    await page.setViewport({ width: 1366, height: 768 });

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return req.abort();
      req.continue();
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: 12000 });
      } catch {
        // fall through with partial DOM
      }
    }

    return await page.content();
  } finally {
    await page.close().catch(() => {});
  }
}

function parsePrice(raw) {
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

export const scrapeVatan = async (url) => {
  try {
    console.log('Scraping Vatan Bilgisayar:', url);
    const html = await fetchHtml(url, {
      waitForSelector: '.product-list__price, .product-detail-info__price',
    });
    const $ = cheerio.load(html);

    const priceText =
      $('.product-list__price').first().text().trim() ||
      $('.product-detail-info__price').first().text().trim() ||
      $('[class*="product-list__price"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) throw new Error('Fiyat bulunamadı (Vatan)');

    return { price, currency: 'TL' };
  } catch (error) {
    console.error('Error scraping Vatan Bilgisayar:', error.message);
    await db.recordBlocked('Vatan Bilgisayar');
    throw error;
  }
};

export const scrapeTeknosa = async (url) => {
  try {
    console.log('Scraping Teknosa:', url);
    const html = await fetchHtml(url, { waitForSelector: '.prc.prc-third, .prc-last' });
    const $ = cheerio.load(html);

    const priceText =
      $('.prc.prc-third').first().text().trim() ||
      $('.prc-last').first().text().trim() ||
      $('[class*="prc-"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) throw new Error('Fiyat bulunamadı (Teknosa)');

    return { price, currency: 'TL' };
  } catch (error) {
    console.error('Error scraping Teknosa:', error.message);
    await db.recordBlocked('Teknosa');
    throw error;
  }
};

export const scrapeMediaMarkt = async (url) => {
  try {
    console.log('Scraping MediaMarkt:', url);
    const html = await fetchHtml(url, {
      waitForSelector: '[data-test="branded-price-whole-value"], .mms-ui-mBgaT',
    });
    const $ = cheerio.load(html);

    const priceText =
      $('[data-test="branded-price-whole-value"]').first().text().trim() ||
      $('.mms-ui-mBgaT').first().text().trim() ||
      $('[class*="Price"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) throw new Error('Fiyat bulunamadı (MediaMarkt)');

    return { price, currency: 'TL' };
  } catch (error) {
    console.error('Error scraping MediaMarkt:', error.message);
    await db.recordBlocked('MediaMarkt');
    throw error;
  }
};

export const scrapePrice = async (url) => {
  if (url.includes('vatan')) return scrapeVatan(url);
  if (url.includes('teknosa')) return scrapeTeknosa(url);
  if (url.includes('mediamarkt')) return scrapeMediaMarkt(url);
  throw new Error('Unsupported retailer');
};

export const closeBrowser = async () => {
  if (cachedBrowser) {
    try { await cachedBrowser.close(); } catch {}
    cachedBrowser = null;
  }
};

export default {
  scrapeVatan,
  scrapeTeknosa,
  scrapeMediaMarkt,
  scrapePrice,
  closeBrowser,
};
