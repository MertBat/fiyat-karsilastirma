import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';

const axiosInstance = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  },
});

export default async function handler(req, res) {
  const { url, groupId } = req.query;

  // Test a specific URL with plain axios (no browser)
  if (url) {
    const report = { url, httpStatus: null, bodyLength: 0, bodySnippet: null, selectors: {}, error: null };
    try {
      const response = await axiosInstance.get(url);
      report.httpStatus = response.status;
      report.bodyLength = response.data?.length || 0;
      report.bodySnippet = String(response.data).slice(0, 800);

      const $ = cheerio.load(response.data);
      report.selectors = {
        'product-list__price': $('.product-list__price').first().text().trim().slice(0, 50),
        'product-detail-info__price': $('.product-detail-info__price').first().text().trim().slice(0, 50),
        'prc.prc-third': $('.prc.prc-third').first().text().trim().slice(0, 50),
        'mms-ui-mBgaT': $('.mms-ui-mBgaT').first().text().trim().slice(0, 50),
        '[data-test=branded-price-whole-value]': $('[data-test="branded-price-whole-value"]').first().text().trim().slice(0, 50),
      };
    } catch (err) {
      report.error = { message: err.message, code: err.code, httpStatus: err.response?.status };
      report.bodySnippet = String(err.response?.data || '').slice(0, 400);
    }
    return res.status(200).json(report);
  }

  // Trigger scrape for a group and return detailed result (does NOT save to DB)
  if (groupId) {
    try {
      const db = (await import('../../lib/db')).default;
      const groups = await db.getProductGroups();
      const group = groups.find((g) => g.groupId === groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const { scrapePrice, closeBrowser } = await import('../../lib/scraper');
      const urlMap = [
        { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
        { retailer: 'MediaMarkt', url: group.mediamarktUrl },
        { retailer: 'Teknosa', url: group.teknosaUrl },
      ].filter((e) => e.url);

      const results = [];
      for (const { retailer, url } of urlMap) {
        try {
          const priceData = await scrapePrice(url);
          results.push({ retailer, url, status: 'success', ...priceData });
        } catch (err) {
          results.push({ retailer, url, status: 'error', error: err.message });
        }
      }
      await closeBrowser();
      return res.status(200).json({ group: group.name, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({
    usage: {
      'Test URL (axios only)': '/api/debug-scrape?url=https://www.vatan.com.tr/...',
      'Test scrape (with browser)': '/api/debug-scrape?groupId=<groupId>',
    },
  });
}
