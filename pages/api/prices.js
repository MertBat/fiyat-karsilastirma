import db from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { groupId } = req.query;

  if (!groupId) {
    return res.status(400).json({ success: false, error: 'groupId query parameter is required' });
  }

  try {
    const prices = await db.getPriceHistoryForGroup(groupId);
    return res.status(200).json({ success: true, prices });
  } catch (error) {
    console.error('GET /api/prices error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
