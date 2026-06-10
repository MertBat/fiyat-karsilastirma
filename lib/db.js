// Database implementation with MongoDB
import { MongoClient } from 'mongodb';

const db = {
  client: null,
  database: null,
  connect: async function () {
    if (this.database) return this.database;
    try {
      const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/fiyatkarsilastirma';
      const dbName = process.env.MONGODB_DB || 'fiyatkarsilastirma';
      this.client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000, 
      });
      await this.client.connect();
      this.database = this.client.db(dbName);
      console.log('Database connection established');
      return this.database;
    } catch (error) {
      if (error?.cause?.code === 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR') {
        console.error(
          'MongoDB Atlas bağlantısı reddedildi (SSL alert 80).\n' +
          '>>> MongoDB Atlas > Network Access bölümünden IP adresinizi beyaz listeye ekleyin\n' +
          '>>> veya "Allow Access from Anywhere" (0.0.0.0/0) seçeneğini etkinleştirin.'
        );
      }
      console.error('Database connection failed:', error);
      throw error;
    }
  },

  _ensureDb: async function () {
    if (!this.database) await this.connect();
  },

  // ── Product Groups ─────────────────────────────────────────────────────────

  addProductGroup: async function (name, vatanUrl, mediamarktUrl, teknosaUrl) {
    await this._ensureDb();
    const { createHash } = await import('crypto');
    const groupId = createHash('md5').update(name.trim().toLowerCase()).digest('hex');
    const collection = this.database.collection('productGroups');
    await collection.updateOne(
      { groupId },
      {
        $setOnInsert: { groupId, createdAt: new Date() },
        $set: {
          name,
          vatanUrl: vatanUrl || null,
          mediamarktUrl: mediamarktUrl || null,
          teknosaUrl: teknosaUrl || null,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    return groupId;
  },

  getProductGroups: async function () {
    await this._ensureDb();
    return this.database.collection('productGroups').find({}).sort({ createdAt: -1 }).toArray();
  },

  getLatestPricesForGroup: async function (groupId) {
    await this._ensureDb();
    const retailers = ['Vatan Bilgisayar', 'MediaMarkt', 'Teknosa'];
    const result = {};
    await Promise.all(
      retailers.map(async (retailer) => {
        const entry = await this.database.collection('prices').findOne(
          { groupId, retailer },
          { sort: { timestamp: -1 } }
        );
        result[retailer] = entry || null;
      })
    );
    return result;
  },

  getPriceHistoryForGroup: async function (groupId) {
    await this._ensureDb();
    return this.database
      .collection('prices')
      .find({ groupId })
      .sort({ timestamp: -1 })
      .toArray();
  },

  deleteProductGroup: async function (groupId) {
    await this._ensureDb();
    await this.database.collection('productGroups').deleteOne({ groupId });
    await this.database.collection('prices').deleteMany({ groupId });
  },

  // ── Prices ─────────────────────────────────────────────────────────────────

  savePrice: async function (groupId, retailer, priceData) {
    await this._ensureDb();
    const timestamp = new Date();
    const doc = {
      groupId,
      retailer,
      price: priceData.price,
      currency: priceData.currency,
      timestamp,
    };
    const result = await this.database.collection('prices').insertOne(doc);
    console.log(`Saved price for group ${groupId} from ${retailer}:`, priceData);

    // Fiyat düşüşü varsa alert oluştur
    await this.checkAndSavePriceAlert(groupId, retailer, {
      price: priceData.price,
      currency: priceData.currency,
      _id: result.insertedId,
    }).catch((err) => {
      console.error('Price alert check failed:', err.message);
    });

    return { success: true, id: result.insertedId };
  },

  // ── Price drop alerts ──────────────────────────────────────────────────────

  checkAndSavePriceAlert: async function (groupId, retailer, newPriceData) {
    await this._ensureDb();

    // Group adını bul
    const group = await this.database.collection('productGroups').findOne({ groupId });
    if (!group) return;

    // Önceki fiyatı bul (en son kaydedilen, şimdi kaydettiğimiz hariç)
    const previousPrice = await this.database.collection('prices').findOne(
      { groupId, retailer, _id: { $ne: newPriceData._id } },
      { sort: { timestamp: -1 } }
    );

    if (!previousPrice) return; // İlk kayıt, karşılaştırma yok

    const oldPrice = previousPrice.price;
    const newPrice = newPriceData.price;

    if (newPrice < oldPrice) {
      const dropAmount = oldPrice - newPrice;
      const dropPercent = Math.round((dropAmount / oldPrice) * 100);

      const alert = {
        groupId,
        groupName: group.name,
        retailer,
        oldPrice,
        newPrice,
        currency: newPriceData.currency || 'TL',
        dropAmount,
        dropPercent,
        timestamp: new Date(),
        read: false,
      };

      await this.database.collection('priceAlerts').insertOne(alert);
      console.log(`🔔 PRICE DROP: ${group.name} @ ${retailer}: ${oldPrice} → ${newPrice} (-${dropPercent}%)`);

      // Ayrıca log'a da yaz
      await this.logEvent('system', 'info', {
        message: 'Fiyat düşüşü tespit edildi',
        groupId,
        groupName: group.name,
        retailer,
        oldPrice,
        newPrice,
        dropPercent,
      }).catch(() => {});
    }
  },

  getPriceAlerts: async function (unreadOnly = true, limit = 50) {
    await this._ensureDb();
    const filter = unreadOnly ? { read: false } : {};
    return this.database
      .collection('priceAlerts')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  },

  markAlertsAsRead: async function (alertIds) {
    await this._ensureDb();
    await this.database.collection('priceAlerts').updateMany(
      { _id: { $in: alertIds } },
      { $set: { read: true } }
    );
  },

  markAllAlertsAsRead: async function () {
    await this._ensureDb();
    await this.database.collection('priceAlerts').updateMany(
      { read: false },
      { $set: { read: true } }
    );
  },

  // ── Block tracking ─────────────────────────────────────────────────────────

  checkBlocked: async function (retailer) {
    await this._ensureDb();
    try {
      const blockStatus = await this.database.collection('blockStatus').findOne({
        retailer,
        blocked: true,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      return !!blockStatus;
    } catch {
      return false;
    }
  },

  recordBlocked: async function (retailer) {
    await this._ensureDb();
    await this.database.collection('blockStatus').insertOne({
      retailer,
      blocked: true,
      timestamp: new Date()
    });
  },

  // ── Unified logging ───────────────────────────────────────────────────────

  logEvent: async function (type, status, details = {}) {
    await this._ensureDb();
    const entry = {
      type,      // 'cron' | 'scrape' | 'product' | 'system'
      status,    // 'started' | 'success' | 'error' | 'info'
      details,
      timestamp: new Date()
    };
    await this.database.collection('appLogs').insertOne(entry);
    const short = JSON.stringify(details).slice(0, 200);
    console.log(`[${type.toUpperCase()}] ${status}: ${short}`);
    return entry;
  },

  getLogs: async function (limit = 100, type = null) {
    await this._ensureDb();
    const filter = type ? { type } : {};
    return this.database
      .collection('appLogs')
      .find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  },

  // ── Cron logging (uses unified logEvent) ─────────────────────────────────

  logCronRun: async function (status, details = {}) {
    return this.logEvent('cron', status, details);
  },

  getCronLogs: async function (limit = 50) {
    return this.getLogs(limit, 'cron');
  }
};

export const connect = () => db.connect();
export default db;