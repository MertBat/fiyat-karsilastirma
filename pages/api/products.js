import db from '../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const groups = await db.getProductGroups();

      const groupsWithPrices = await Promise.all(
        groups.map(async (group) => {
          const latestPrices = await db.getLatestPricesForGroup(group.groupId);
          return { ...group, latestPrices };
        })
      );

      return res.status(200).json({ success: true, groups: groupsWithPrices });
    } catch (error) {
      console.error('GET /api/products error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'POST') {
    const { name, vatanUrl, mediamarktUrl, teknosaUrl } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Ürün adı zorunludur.' });
    }
    if (!vatanUrl && !mediamarktUrl && !teknosaUrl) {
      return res.status(400).json({ success: false, error: 'En az bir mağaza URL\'si girilmelidir.' });
    }

    try {
      const groupId = await db.addProductGroup(name.trim(), vatanUrl, mediamarktUrl, teknosaUrl);
      await db.logEvent('product', 'success', {
        action: 'add',
        groupId,
        name: name.trim(),
        retailers: [
          vatanUrl && 'Vatan',
          mediamarktUrl && 'MediaMarkt',
          teknosaUrl && 'Teknosa',
        ].filter(Boolean),
      }).catch(() => {});
      return res.status(201).json({ success: true, groupId });
    } catch (error) {
      console.error('POST /api/products error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ success: false, error: 'groupId gereklidir.' });
    }
    try {
      await db.deleteProductGroup(groupId);
      await db.logEvent('product', 'info', {
        action: 'delete',
        groupId,
      }).catch(() => {});
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('DELETE /api/products error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
