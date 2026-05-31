export default async function handler(req, res) {
  const report = {
    env: {
      MONGODB_URI_SET: !!process.env.MONGODB_URI,
      MONGODB_DB: process.env.MONGODB_DB || '(not set, default: fiyatkarsilastirma)',
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL || '(not set)',
    },
    db: null,
    groups: null,
    error: null,
  };

  try {
    const db = (await import('../../lib/db')).default;
    await db.connect();
    report.db = 'connected';

    const groups = await db.getProductGroups();
    report.groups = {
      count: groups.length,
      names: groups.map((g) => g.name),
    };

    if (groups.length > 0) {
      const sample = groups[0];
      const latestPrices = await db.getLatestPricesForGroup(sample.groupId);
      report.sampleGroup = {
        name: sample.name,
        groupId: sample.groupId,
        vatanUrl: sample.vatanUrl ? 'SET' : null,
        mediamarktUrl: sample.mediamarktUrl ? 'SET' : null,
        teknosaUrl: sample.teknosaUrl ? 'SET' : null,
        latestPrices: Object.fromEntries(
          Object.entries(latestPrices).map(([k, v]) => [
            k,
            v ? { price: v.price, timestamp: v.timestamp } : null,
          ])
        ),
      };
    }
  } catch (err) {
    report.db = 'error';
    report.error = err.message;
  }

  return res.status(200).json(report);
}
