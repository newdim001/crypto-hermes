/**
 * Binance Connector Service
 * Connect to Binance Testnet for paper trading
 */

require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Configuration - Testnet uses different domain
const BASE_URL = process.env.BINANCE_TESTNET === 'true' 
  ? 'https://testnet.binance.vision/api'
  : 'https://api.binance.com';

const TESTNET = process.env.BINANCE_TESTNET === 'true';

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

// Helper: Generate signature
function generateSignature(queryString) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(queryString)
    .digest('hex');
}

// Helper: Make request
async function request(method, endpoint, params = {}) {
  try {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({
      ...params,
      timestamp,
      recvWindow: 5000
    }).toString();

    const signature = generateSignature(queryString);
    const url = `${BASE_URL}${endpoint}?${queryString}&signature=${signature}`;

    const response = await axios({
      method,
      url,
      headers: {
        'X-MBX-APIKEY': API_KEY
      }
    });

    return response.data;
  } catch (error) {
    console.error('Binance API Error:', error.response?.data || error.message);
    throw error;
  }
}

// ============================================
// MARKET DATA FUNCTIONS
// ============================================

/**
 * Get current price for a symbol
 */
async function getPrice(symbol) {
  const data = await request('GET', '/api/v3/ticker/price', { symbol: symbol.toUpperCase() });
  return parseFloat(data.price);
}

/**
 * Get klines (candlestick) data
 */
async function getKlines(symbol, interval = '1h', limit = 100) {
  const data = await request('GET', '/api/v3/klines', {
    symbol: symbol.toUpperCase(),
    interval,
    limit
  });

  return data.map(k => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
    takerBuyBaseVolume: parseFloat(k[9]),
    takerBuyQuoteVolume: parseFloat(k[10])
  }));
}

/**
 * Get 24h ticker
 */
async function get24hTicker(symbol) {
  const data = await request('GET', '/api/v3/ticker/24hr', { symbol: symbol.toUpperCase() });
  return {
    symbol: data.symbol,
    priceChange: parseFloat(data.priceChange),
    priceChangePercent: parseFloat(data.priceChangePercent),
    lastPrice: parseFloat(data.lastPrice),
    highPrice: parseFloat(data.highPrice),
    lowPrice: parseFloat(data.lowPrice),
    volume: parseFloat(data.volume),
    quoteVolume: parseFloat(data.quoteVolume)
  };
}

/**
 * Get order book depth
 */
async function getOrderBook(symbol, limit = 20) {
  const data = await request('GET', '/api/v3/depth', {
    symbol: symbol.toUpperCase(),
    limit
  });

  return {
    bids: data.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) })),
    asks: data.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }))
  };
}

// ============================================
// ACCOUNT FUNCTIONS
// ============================================

/**
 * Get account balance
 */
async function getBalance() {
  const account = await request('GET', '/api/v3/account');
  
  return account.balances
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({
      asset: b.asset,
      free: parseFloat(b.free),
      locked: parseFloat(b.locked)
    }));
}

/**
 * Get all open orders
 */
async function getOpenOrders(symbol = null) {
  const params = symbol ? { symbol: symbol.toUpperCase() } : {};
  return request('GET', '/api/v3/openOrders', params);
}

/**
 * Get all orders (last 7 days)
 */
async function getAllOrders(symbol, limit = 100) {
  return request('GET', '/api/v3/allOrders', {
    symbol: symbol.toUpperCase(),
    limit
  });
}

// ============================================
// ORDER FUNCTIONS
// ============================================

/**
 * Place market order
 */
async function placeMarketOrder(symbol, side, quantity) {
  return request('POST', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    side: side.toUpperCase(),
    type: 'MARKET',
    quantity
  });
}

/**
 * Place limit order
 */
async function placeLimitOrder(symbol, side, quantity, price) {
  return request('POST', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    side: side.toUpperCase(),
    type: 'LIMIT',
    quantity,
    price,
    timeInForce: 'GTC'
  });
}

/**
 * Place stop-loss order
 */
async function placeStopLossOrder(symbol, side, quantity, stopPrice) {
  return request('POST', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    side: side.toUpperCase(),
    type: 'STOP_LOSS',
    quantity,
    stopPrice,
    timeInForce: 'GTC'
  });
}

/**
 * Cancel order
 */
async function cancelOrder(symbol, orderId) {
  return request('DELETE', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    orderId
  });
}

/**
 * Get order status
 */
async function getOrder(symbol, orderId) {
  return request('GET', '/api/v3/order', {
    symbol: symbol.toUpperCase(),
    orderId
  });
}

// ============================================
// TESTNET PING
// ============================================

/**
 * Test connection
 */
async function ping() {
  return request('GET', '/api/v3/ping');
}

/**
 * Get server time
 */
async function getServerTime() {
  const data = await request('GET', '/api/v3/time');
  return new Date(data.serverTime);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Market Data
  getPrice,
  getKlines,
  get24hTicker,
  getOrderBook,
  
  // Account
  getBalance,
  getOpenOrders,
  getAllOrders,
  
  // Orders
  placeMarketOrder,
  placeLimitOrder,
  placeStopLossOrder,
  cancelOrder,
  getOrder,
  
  // System
  ping,
  getServerTime,
  BASE_URL
};

// CLI Test
if (require.main === module) {
  (async () => {
    console.log('Testing Binance Connection...');
    
    try {
      const time = await getServerTime();
      console.log('✅ Connected! Server time:', time.toLocaleString());
      
      const price = await getPrice('BTCUSDT');
      console.log('BTC Price:', price);
      
      const balance = await getBalance();
      console.log('Balance:', balance.slice(0, 5));
    } catch (e) {
      console.error('❌ Error:', e.message);
    }
  })();
}
