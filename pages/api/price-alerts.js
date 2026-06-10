import db from '../../lib/db';

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const alerts = await db.getPriceAlerts(true, 20);
      return response.status(200).json({ success: true, alerts });
    } catch (error) {
      console.error('GET /api/price-alerts error:', error);
      return response.status(500).json({ success: false, error: error.message });
    }
  }

  if (request.method === 'POST') {
    try {
      const { alertIds, markAll } = request.body;
      if (markAll) {
        await db.markAllAlertsAsRead();
      } else if (Array.isArray(alertIds) && alertIds.length > 0) {
        // ObjectId string'lerini MongoDB ObjectId'lerine çevir
        const { ObjectId } = await import('mongodb');
        const oids = alertIds.map((id) => new ObjectId(id));
        await db.markAlertsAsRead(oids);
      }
      return response.status(200).json({ success: true });
    } catch (error) {
      console.error('POST /api/price-alerts error:', error);
      return response.status(500).json({ success: false, error: error.message });
    }
  }

  return response.status(405).json({ error: 'Method not allowed' });
}
