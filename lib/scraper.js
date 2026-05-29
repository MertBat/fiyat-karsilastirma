import axios from 'axios';
import * as cheerio from 'cheerio';
import https from 'https';
import { createRequire } from 'module';
import db from './db.js';

const require = createRequire(import.meta.url);

// Create an axios instance with https agent to handle SSL certificate issues
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  }),
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'no-cache',
  }
});

// Scraper functions for each retailer
export const scrapeVatan = async (url) => {
  try {
    console.log('Scraping Vatan Bilgisayar:', url);
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);
    
    // Vatan Bilgisayar price selector
    let priceText = $('.product-list__price').first().text().trim();
    
    // Turkish format: dot = thousands separator, comma = decimal
    const priceNumber = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
    
    return {
      price: priceNumber,
      currency: 'TL' // Assuming Turkish Lira for all retailers
    };
  } catch (error) {
    console.error('Error scraping Vatan Bilgisayar:', error);
    // Record that we're blocked
    await db.recordBlocked('Vatan Bilgisayar');
    throw error;
  }
};

export const scrapeTeknosa = async (url) => {
  let browser;
  try {
    console.log('Scraping Teknosa (Puppeteer stealth):', url);

    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());

    browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7' });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.prc.prc-third', { timeout: 15000 });

    const priceText = await page.$eval('.prc.prc-third', (el) => el.textContent.trim());
    const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));

    console.log('Teknosa price found:', price);
    return { price, currency: 'TL' };
  } catch (error) {
    console.error('Error scraping Teknosa:', error.message);
    await db.recordBlocked('Teknosa');
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};

export const scrapeMediaMarkt = async (url) => {
  try {
    console.log('Scraping MediaMarkt:', url);
    const response = await axiosInstance.get(url);
    const $ = cheerio.load(response.data);
    
    // MediaMarkt price selector
    let priceText = $('.mms-ui-mBgaT').first().text().trim();
    
    // Turkish format: dot = thousands separator, comma = decimal
    const priceNumber = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'));
    
    return {
      price: priceNumber,
      currency: 'TL'
    };
  } catch (error) {
    console.error('Error scraping MediaMarkt:', error);
    // Record that we're blocked
    await db.recordBlocked('MediaMarkt');
    throw error;
  }
};

// Generic scraper that determines which function to use based on URL
export const scrapePrice = async (url) => {
  if (url.includes('vatan')) {
    return scrapeVatan(url);
  } else if (url.includes('teknosa')) {
    return scrapeTeknosa(url);
  } else if (url.includes('mediamarkt')) {
    return scrapeMediaMarkt(url);
  } else {
    throw new Error('Unsupported retailer');
  }
};

export default {
  scrapeVatan,
  scrapeTeknosa,
  scrapeMediaMarkt,
  scrapePrice
};