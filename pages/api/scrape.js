import db from '../../lib/db';
import { scrapePrice, closeBrowser } from '../../lib/scraper';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // retailer is optional — if provided, only scrape that one store
  const { groupId, retailer: targetRetailer } = request.body;

  if (!groupId) {
    return response.status(400).json({ success: false, error: 'groupId is required' });
  }

  try {
    const groups = await db.getProductGroups();
    const group = groups.find((g) => g.groupId === groupId);

    if (!group) {
      return response.status(404).json({ success: false, error: 'Ürün grubu bulunamadı.' });
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
      try {
        const priceData = await scrapePrice(url);
        await db.savePrice(groupId, retailer, priceData);
        results.push({ retailer, price: priceData.price, currency: priceData.currency });
      } catch (err) {
        results.push({ retailer, error: err.message });
      }
    }

    return response.status(200).json({ success: true, results });
  } catch (error) {
    console.error('Scraping error:', error);
    return response.status(500).json({ success: false, error: error.message });
  } finally {
    await closeBrowser();
  }
}