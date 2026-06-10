import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import db from './db.js';

// ── HTTP client ───────────────────────────────────────────────────────────────

// Realistic browser headers to avoid 403 blocks
export function buildHeaders(extra = {}) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    ...extra,
  };
}

const directClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 20000,
  headers: buildHeaders(),
  validateStatus: () => true,
});

const scraperApiClient = axios.create({
  timeout: 270000,
  headers: buildHeaders(),
  validateStatus: () => true,
});

// ── Fetch HTML ────────────────────────────────────────────────────────────────

async function fetchHtml(url, { render = true, headers: extraHeaders = {} } = {}) {
  const apiKey = process.env.SCRAPER_API_KEY;

  if (apiKey) {
    const scraperUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}&country_code=tr&render=${render}`;
    const response = await scraperApiClient.get(scraperUrl);

    if (response.status >= 400) {
      const err = new Error(`ScraperAPI HTTP ${response.status} → ${url}`);
      err.httpStatus = response.status;
      err.url = url;
      throw err;
    }

    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    if (body.startsWith('{"error":') || body.startsWith('{"success":false')) {
      const err = new Error(`ScraperAPI returned an error: ${body.slice(0, 300)}`);
      throw err;
    }

    return body;
  }

  // Local dev fallback: direct request with merged headers
  const mergedHeaders = { ...buildHeaders(), ...extraHeaders };
  const response = await directClient.get(url, { headers: mergedHeaders });

  if (response.status >= 400) {
    const err = new Error(`HTTP ${response.status} → ${url}`);
    err.httpStatus = response.status;
    err.url = url;
    throw err;
  }

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
  const strategies = [
    // Strategy 1: Google Web Cache (bypasses WAF entirely)
    {
      name: 'GoogleCache',
      fetch: async () => {
        const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
        console.log('  Trying Google Cache:', cacheUrl);
        const resp = await directClient.get(cacheUrl, { headers: buildHeaders() });
        if (resp.status >= 400) {
          const err = new Error(`Google Cache HTTP ${resp.status}`);
          err.httpStatus = resp.status;
          throw err;
        }
        return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      },
    },
    // Strategy 2: textise dot iitty — text proxy (Turkish friendly)
    {
      name: 'TextProxy',
      fetch: async () => {
        const proxyUrl = `https://r.jina.ai/${url}`;
        console.log('  Trying Jina AI reader:', proxyUrl);
        const resp = await directClient.get(proxyUrl, {
          headers: buildHeaders({ Accept: 'text/plain,text/html,*/*' }),
        });
        if (resp.status >= 400) {
          const err = new Error(`Text proxy HTTP ${resp.status}`);
          err.httpStatus = resp.status;
          throw err;
        }
        return typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      },
    },
    // Strategy 3: Direct with Google Referer (last resort)
    {
      name: 'DirectGoogleRef',
      fetch: async () => {
        console.log('  Trying direct with Google referer:', url);
        return await fetchHtml(url, {
          render: true,
          headers: { Referer: 'https://www.google.com/' },
        });
      },
    },
    // Strategy 4: Direct with mobile UA
    {
      name: 'DirectMobile',
      fetch: async () => {
        console.log('  Trying direct with mobile UA:', url);
        return await fetchHtml(url, {
          render: true,
          headers: {
            Referer: 'https://www.google.com.tr/',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36',
          },
        });
      },
    },
  ];

  let lastError;
  for (const strategy of strategies) {
    try {
      console.log(`Teknosa → ${strategy.name}...`);
      const html = await strategy.fetch(url);

      const $ = cheerio.load(html);

      // Try JSON-LD structured data first (survives cache/proxy better)
      let jsonLdPrice = NaN;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).html());
          const offers = data.offers || (Array.isArray(data) && data[0]?.offers);
          if (offers?.price) jsonLdPrice = parseFloat(offers.price);
        } catch {}
      });
      if (!Number.isNaN(jsonLdPrice) && jsonLdPrice > 0) {
        console.log(`Teknosa ✓ (${strategy.name}, JSON-LD): ${jsonLdPrice} TL`);
        return { price: jsonLdPrice, currency: 'TL' };
      }

      // Fallback to CSS selectors
      const priceText =
        $('.prc.prc-third').first().text().trim() ||
        $('.prc-last').first().text().trim() ||
        $('[class*="prc-"]').first().text().trim() ||
        $('[class*="price"]').first().text().trim() ||
        $('[data-test="price"]').first().text().trim();

      const price = parsePrice(priceText);
      if (price && !Number.isNaN(price)) {
        console.log(`Teknosa ✓ (${strategy.name}, CSS): ${price} TL`);
        return { price, currency: 'TL' };
      }

      // HTML geldi ama fiyat parse edilemedi → sonraki stratejiye geç
      console.log(`Teknosa ${strategy.name}: HTML alındı ama fiyat bulunamadı, sonraki strateji deneniyor...`);
      lastError = Object.assign(new Error('Fiyat bulunamadı (Teknosa)'), {
        htmlSnippet: html.slice(0, 500),
      });
    } catch (e) {
      console.log(`Teknosa ${strategy.name} başarısız: ${e.message}`);
      lastError = e;
      // 403/429 → sonraki stratejiyi dene; diğer hatalar da dene
    }
  }

  // All strategies exhausted
  console.error('Teknosa: Tüm stratejiler başarısız oldu.');
  await db.recordBlocked('Teknosa');
  throw lastError || new Error('Teknosa scraping başarısız: tüm stratejiler tükendi');
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
  buildHeaders,
};
