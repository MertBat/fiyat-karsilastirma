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

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const results = [];

    // Call /api/scrape once per group+retailer — each is a separate serverless
    // invocation with its own 60s timeout (Hobby plan compatible)
    for (const group of groups) {
      const retailers = [
        { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
        { retailer: 'MediaMarkt',       url: group.mediamarktUrl },
        { retailer: 'Teknosa',          url: group.teknosaUrl },
      ].filter((r) => r.url);

      for (const { retailer } of retailers) {
        try {
          const res = await fetch(`${baseUrl}/api/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: group.groupId, retailer }),
          });
          const data = await res.json();
          const detail = data.results?.[0];
          if (detail?.error) {
            results.push({ groupId: group.groupId, retailer, status: 'error', reason: detail.error });
          } else {
            results.push({ groupId: group.groupId, retailer, status: 'success', price: detail?.price });
          }
        } catch (err) {
          console.error(`Failed to scrape ${retailer} for ${group.groupId}:`, err.message);
          results.push({ groupId: group.groupId, retailer, status: 'error', reason: err.message });
        }
      }
    }

    return response.status(200).json({
      message: 'Günlük scraping tamamlandı.',
      time: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Daily cron error:', error);
    return response.status(500).json({ success: false, error: error.message });
  }
}