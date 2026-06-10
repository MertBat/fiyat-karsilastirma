import db from '../../lib/db';
import { scrapePrice, closeBrowser } from '../../lib/scraper';

export default async function handler(request, response) {
  // ── Always return JSON, even for catastrophic errors ──────────────────────
  const safeJson = (status, body) => {
    try {
      return response.status(status).json(body);
    } catch {
      return response.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
    }
  };

  if (request.method !== 'POST') {
    return safeJson(405, { error: 'Method not allowed' });
  }

  // retailer is optional — if provided, only scrape that one store
  const { groupId, retailer: targetRetailer } = request.body;

  if (!groupId) {
    return safeJson(400, { success: false, error: 'groupId is required' });
  }

  const scrapeStart = Date.now();

  try {
    const groups = await db.getProductGroups();
    const group = groups.find((g) => g.groupId === groupId);

    if (!group) {
      return safeJson(404, { success: false, error: 'Ürün grubu bulunamadı.' });
    }

    let urlMap = [
      { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
      { retailer: 'MediaMarkt', url: group.mediamarktUrl },
      { retailer: 'Teknosa', url: group.teknosaUrl }
    ].filter((e) => e.url);

    if (targetRetailer) {
      urlMap = urlMap.filter((e) => e.retailer === targetRetailer);
    }

    const results = [];
    for (const { retailer, url } of urlMap) {
      const perRetailerStart = Date.now();
      try {
        const priceData = await scrapePrice(url);
        await db.savePrice(groupId, retailer, priceData);
        results.push({ retailer, price: priceData.price, currency: priceData.currency });

        await db.logEvent('scrape', 'success', {
          groupId,
          groupName: group.name,
          retailer,
          url,
          price: priceData.price,
          durationMs: Date.now() - perRetailerStart,
        }).catch(() => {});
      } catch (err) {
        results.push({ retailer, error: err.message });

        await db.logEvent('scrape', 'error', {
          groupId,
          groupName: group.name,
          retailer,
          url,
          error: err.message,
          httpStatus: err.httpStatus || null,
          durationMs: Date.now() - perRetailerStart,
        }).catch(() => {});
      }
    }

    return safeJson(200, { success: true, results });
  } catch (error) {
    console.error('Scraping error:', error);
    await db.logEvent('scrape', 'error', {
      groupId,
      error: error.message,
      durationMs: Date.now() - scrapeStart,
    }).catch(() => {});
    return safeJson(500, { success: false, error: error.message });
  } finally {
    await closeBrowser();
  }
}