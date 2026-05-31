import { scrapePrice, closeBrowser } from '../../../lib/scraper';
import db from '../../../lib/db';

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  console.log('Daily scraping task started at', new Date().toISOString());

  try {
    const groups = await db.getProductGroups();

    if (!groups.length) {
      return response.status(200).json({
        message: 'Takip edilen ürün grubu bulunamadı.',
        time: new Date().toISOString()
      });
    }

    const results = [];

    for (const group of groups) {
      const urlMap = [
        { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
        { retailer: 'MediaMarkt', url: group.mediamarktUrl },
        { retailer: 'Teknosa', url: group.teknosaUrl }
      ].filter((e) => e.url);

      for (const { retailer, url } of urlMap) {
        const blocked = await db.checkBlocked(retailer);
        if (blocked) {
          results.push({ groupId: group.groupId, retailer, status: 'skipped', reason: 'blocked' });
          continue;
        }
        try {
          const priceData = await scrapePrice(url);
          await db.savePrice(group.groupId, retailer, priceData);
          results.push({ groupId: group.groupId, retailer, status: 'success', price: priceData.price });
        } catch (err) {
          console.error(`Failed to scrape ${url}:`, err.message);
          results.push({ groupId: group.groupId, retailer, status: 'error', reason: err.message });
        }
      }
    }

    return response.status(200).json({
      message: 'Günlük scraping tamamlandı.',
      time: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Daily cron error:', error);
    return response.status(500).json({ success: false, error: error.message });
  } finally {
    await closeBrowser();
  }
}