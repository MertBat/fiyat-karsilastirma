import db from '../../../lib/db';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const logs = await db.getCronLogs(30);
    return response.status(200).json({
      time: new Date().toISOString(),
      count: logs.length,
      logs,
    });
  } catch (error) {
    console.error('Cron logs error:', error);
    return response.status(500).json({ error: error.message });
  }
}
