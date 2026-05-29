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
        tls: true,
        tlsAllowInvalidCertificates: true,
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
    const result = await this.database.collection('prices').insertOne({
      groupId,
      retailer,
      price: priceData.price,
      currency: priceData.currency,
      timestamp: new Date()
    });
    console.log(`Saved price for group ${groupId} from ${retailer}:`, priceData);
    return { success: true, id: result.insertedId };
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
  }
};

export const connect = () => db.connect();
export default db;