import db from '../../lib/db';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(request.url, `http://${request.headers.host}`);
    const type = searchParams.get('type'); // 'cron' | 'scrape' | 'product' | null (all)
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const logs = await db.getLogs(Math.min(limit, 200), type || null);
    return response.status(200).json({
      time: new Date().toISOString(),
      count: logs.length,
      filter: type || 'all',
      logs,
    });
  } catch (error) {
    console.error('Logs error:', error);
    return response.status(500).json({ error: error.message });
  }
}
