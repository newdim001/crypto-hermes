// CryptoEdge WebSocket Client
// Real-time price data from Binance Testnet

const WebSocket = require('ws');

const BINANCE_WS = 'wss://testnet.binance.vision/ws';
const PAIRS = ['btcusdt', 'ethusdt', 'bnbusdt', 'solusdt', 'xrpusdt', 'adausdt', 'dogeusdt', 'avaxusdt', 'dotusdt', 'maticusdt'];

class BinanceWebSocket {
  constructor() {
    this.ws = null;
    this.prices = {};
    this.subscribers = [];
    this.reconnectDelay = 5000;
  }

  connect() {
    // Create combined stream
    const streams = PAIRS.map(p => `${p}@ticker`).join('/');
    this.ws = new WebSocket(`${BINANCE_WS}/${streams}`);

    this.ws.on('open', () => {
      console.log('🔌 WebSocket connected');
    });

    this.ws.on('message', (data) => {
      try {
        const ticker = JSON.parse(data);
        this.prices[ticker.s] = {
          price: parseFloat(ticker.c),
          volume: parseFloat(ticker.v),
          change: parseFloat(ticker.P),
          high: parseFloat(ticker.h),
          low: parseFloat(ticker.l),
          time: ticker.E
        };
        this.notify();
      } catch (e) {}
    });

    this.ws.on('close', () => {
      console.log('🔌 WebSocket disconnected, reconnecting...');
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    this.ws.on('error', (e) => {
      console.log('WebSocket error:', e.message);
    });
  }

  getPrice(symbol) {
    return this.prices[symbol] || null;
  }

  getAllPrices() {
    return this.prices;
  }

  subscribe(callback) {
    this.subscribers.push(callback);
  }

  notify() {
    this.subscribers.forEach(cb => cb(this.prices));
  }
}

// Export singleton
module.exports = new BinanceWebSocket();
