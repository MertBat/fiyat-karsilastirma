import db from '../../lib/db';
import { scrapePrice, closeBrowser } from '../../lib/scraper';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { groupId } = request.body;

  if (!groupId) {
    return response.status(400).json({ success: false, error: 'groupId is required' });
  }

  try {
    const groups = await db.getProductGroups();
    const group = groups.find((g) => g.groupId === groupId);

    if (!group) {
      return response.status(404).json({ success: false, error: 'Ürün grubu bulunamadı.' });
    }

    const urlMap = [
      { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
      { retailer: 'MediaMarkt', url: group.mediamarktUrl },
      { retailer: 'Teknosa', url: group.teknosaUrl }
    ].filter((e) => e.url);

    const results = await Promise.allSettled(
      urlMap.map(async ({ retailer, url }) => {
        const priceData = await scrapePrice(url);
        await db.savePrice(groupId, retailer, priceData);
        return { retailer, price: priceData.price, currency: priceData.currency };
      })
    );

    const summary = results.map((r, i) =>
      r.status === 'fulfilled'
        ? { retailer: urlMap[i].retailer, ...r.value }
        : { retailer: urlMap[i].retailer, error: r.reason?.message }
    );

    return response.status(200).json({ success: true, results: summary });
  } catch (error) {
    console.error('Scraping error:', error);
    return response.status(500).json({ success: false, error: error.message });
  } finally {
    await closeBrowser();
  }
}