import db from '../../../lib/db';

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  console.log('Daily scraping task started at', new Date().toISOString());

  // Kalıcı log: cron başladı
  let cronLog;
  try {
    cronLog = await db.logCronRun('started', {
      message: 'Günlük cron tetiklendi',
    });
  } catch (logErr) {
    console.error('Cron log (started) yazılamadı:', logErr.message);
  }

  try {
    const groups = await db.getProductGroups();

    if (!groups.length) {
      await db.logCronRun('success', {
        message: 'Takip edilen ürün grubu bulunamadı.',
        durationMs: Date.now() - startTime,
      }).catch(() => {});
      return response.status(200).json({
        message: 'Takip edilen ürün grubu bulunamadı.',
        time: new Date().toISOString()
      });
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Call /api/scrape once per group+retailer — each is a separate serverless
    // invocation with its own 60s timeout (Hobby plan compatible)
    for (const group of groups) {
      const retailers = [
        { retailer: 'Vatan Bilgisayar', url: group.vatanUrl },
        { retailer: 'MediaMarkt',       url: group.mediamarktUrl },
        { retailer: 'Teknosa',          url: group.teknosaUrl },
      ].filter((r) => r.url);

      for (const { retailer } of retailers) {
        const scrapeStart = Date.now();
        try {
          const res = await fetch(`${baseUrl}/api/scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '',
            },
            body: JSON.stringify({ groupId: group.groupId, retailer }),
          });

          // Guard against HTML responses (Vercel error pages, etc.)
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(
              `/api/scrape non‑JSON yanıt döndü (${res.status}). İlk 200 karakter: ${text.slice(0, 200)}`
            );
          }

          const data = await res.json();
          const detail = data.results?.[0];
          if (detail?.error) {
            errorCount++;
            results.push({ groupId: group.groupId, retailer, status: 'error', reason: detail.error });
          } else {
            successCount++;
            results.push({ groupId: group.groupId, retailer, status: 'success', price: detail?.price });
          }
        } catch (err) {
          errorCount++;
          console.error(`Failed to scrape ${retailer} for ${group.groupId}:`, err.message);
          results.push({ groupId: group.groupId, retailer, status: 'error', reason: err.message });
        }
        console.log(`[CRON] ${group.groupId} / ${retailer}: ${Date.now() - scrapeStart}ms`);
      }
    }

    const durationMs = Date.now() - startTime;
    await db.logCronRun('success', {
      message: 'Günlük scraping tamamlandı.',
      groupCount: groups.length,
      successCount,
      errorCount,
      durationMs,
      results: results.map(r => ({
        groupId: r.groupId,
        retailer: r.retailer,
        status: r.status,
        price: r.price,
        reason: r.reason,
      })),
    }).catch(() => {});

    return response.status(200).json({
      message: 'Günlük scraping tamamlandı.',
      time: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Daily cron error:', error);
    const durationMs = Date.now() - startTime;
    await db.logCronRun('error', {
      message: error.message,
      stack: error.stack?.slice(0, 1000),
      durationMs,
    }).catch(() => {});
    return response.status(500).json({ success: false, error: error.message });
  }
}