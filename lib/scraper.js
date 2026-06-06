import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import db from './db.js';

// ── HTTP client ───────────────────────────────────────────────────────────────

const BASE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
};

const directClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 20000,
  headers: BASE_HEADERS,
});

const scraperApiClient = axios.create({
  timeout: 270000, // 4.5 minutes — stays under Vercel Pro 300s limit
  headers: BASE_HEADERS,
});

// ── Fetch HTML ────────────────────────────────────────────────────────────────

async function fetchHtml(url, { render = true } = {}) {
  const apiKey = process.env.SCRAPER_API_KEY;

  if (apiKey) {
    const scraperUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=tr&render=true`;
    const response = await scraperApiClient.get(scraperUrl);

    // scraperapi sometimes returns JSON errors (e.g. invalid key) with
    // content-type application/json — axios auto‑parses those. Always
    // pass a string to cheerio.
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    // Detect scraperapi‑level failures early
    if (body.startsWith('{"error":') || body.startsWith('{"success":false')) {
      const err = new Error(`ScraperAPI returned an error: ${body.slice(0, 300)}`);
      throw err;
    }

    return body;
  }

  // Local dev fallback: direct request
  const response = await directClient.get(url);
  const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  return body;
}

// ── Price parsing ─────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

// ── Retailer scrapers ─────────────────────────────────────────────────────────

export const scrapeVatan = async (url) => {
  try {
    console.log('Scraping Vatan Bilgisayar:', url);
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const priceText =
      $('.product-list__price').first().text().trim() ||
      $('.product-detail-info__price').first().text().trim() ||
      $('[class*="product-list__price"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) {
      throw Object.assign(new Error('Fiyat bulunamadı (Vatan)'), { htmlSnippet: html.slice(0, 1500) });
    }
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
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const priceText =
      $('.prc.prc-third').first().text().trim() ||
      $('.prc-last').first().text().trim() ||
      $('[class*="prc-"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) {
      throw Object.assign(new Error('Fiyat bulunamadı (Teknosa)'), { htmlSnippet: html.slice(0, 1500) });
    }
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
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    // Try JSON-LD structured data first (faster, more reliable)
    let jsonLdPrice = NaN;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const offers = data.offers || (Array.isArray(data) && data[0]?.offers);
        if (offers?.price) jsonLdPrice = parseFloat(offers.price);
      } catch {}
    });
    if (!Number.isNaN(jsonLdPrice) && jsonLdPrice > 0) return { price: jsonLdPrice, currency: 'TL' };

    const priceText =
      $('[data-test="branded-price-whole-value"]').first().text().trim() ||
      $('[class*="branded-price"]').first().text().trim() ||
      $('.mms-ui-mBgaT').first().text().trim() ||
      $('[class*="Price"]').first().text().trim();

    const price = parsePrice(priceText);
    if (!price || Number.isNaN(price)) {
      throw Object.assign(new Error('Fiyat bulunamadı (MediaMarkt)'), { htmlSnippet: html.slice(0, 1500) });
    }
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

// Kept for API compatibility — no-op now (no persistent browser)
export const closeBrowser = async () => {};

export default {
  scrapeVatan,
  scrapeTeknosa,
  scrapeMediaMarkt,
  scrapePrice,
  closeBrowser,
};
