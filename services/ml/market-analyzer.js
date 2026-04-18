// CryptoEdge Market Analyzer
// BTC Correlation, Market Breadth, Cross-Asset Analysis

const axios = require('axios');

class MarketAnalyzer {
  
  constructor() {
    this.btcPrice = null;
  }
  
  // Get BTC price and dominance
  async getBTCData() {
    try {
      const r = await axios.get('https://testnet.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT');
      return {
        price: parseFloat(r.data.lastPrice),
        change24h: parseFloat(r.data.priceChangePercent),
        volume: parseFloat(r.data.volume)
      };
    } catch (e) {
      return null;
    }
  }
  
  // Calculate correlation with BTC
  async getCorrelation(symbol) {
    try {
      // Get BTC data
      const btc = await axios.get('https://testnet.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24');
      const symbolData = await axios.get(`https://testnet.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h&limit=24`);
      
      const btcReturns = [];
      const symbolReturns = [];
      
      for (let i = 1; i < 24; i++) {
        const btcPrev = parseFloat(btc.data[i-1][4]);
        const btcCurr = parseFloat(btc.data[i][4]);
        btcReturns.push((btcCurr - btcPrev) / btcPrev);
        
        const symPrev = parseFloat(symbolData.data[i-1][4]);
        const symCurr = parseFloat(symbolData.data[i][4]);
        symbolReturns.push((symCurr - symPrev) / symPrev);
      }
      
      const btcMean = btcReturns.reduce((a,b) => a+b, 0) / btcReturns.length;
      const symMean = symbolReturns.reduce((a,b) => a+b, 0) / symbolReturns.length;
      
      let numerator = 0, btcDenom = 0, symDenom = 0;
      for (let i = 0; i < btcReturns.length; i++) {
        const btcDiff = btcReturns[i] - btcMean;
        const symDiff = symbolReturns[i] - symMean;
        numerator += btcDiff * symDiff;
        btcDenom += btcDiff * btcDiff;
        symDenom += symDiff * symDiff;
      }
      
      const correlation = numerator / Math.sqrt(btcDenom * symDenom);
      return correlation;
    } catch (e) {
      return 0;
    }
  }
  
  // Get Order Book Data
  async getOrderBook(symbol, depth = 20) {
    try {
      const r = await axios.get(`https://testnet.binance.vision/api/v3/depth?symbol=${symbol}&limit=${depth}`);
      
      const bids = r.data.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
      const asks = r.data.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));
      
      const bidVolume = bids.reduce((sum, b) => sum + b.price * b.qty, 0);
      const askVolume = asks.reduce((sum, a) => sum + a.price * a.qty, 0);
      
      const spread = asks[0].price - bids[0].price;
      const spreadPercent = (spread / asks[0].price) * 100;
      
      const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume);
      
      return {
        symbol,
        bids: bids.slice(0, 5),
        asks: asks.slice(0, 5),
        bidVolume: bidVolume.toFixed(2),
        askVolume: askVolume.toFixed(2),
        spread: spread.toFixed(2),
        spreadPercent: spreadPercent.toFixed(4),
        imbalance: imbalance.toFixed(4),
        recommendation: imbalance > 0.3 ? 'BUY' : imbalance < -0.3 ? 'SELL' : 'NEUTRAL'
      };
    } catch (e) {
      return { symbol, error: e.message };
    }
  }
  
  // Whale Detection (large orders)
  async checkWhales(symbol) {
    try {
      const r = await axios.get(`https://testnet.binance.vision/api/v3/trades?symbol=${symbol}&limit=100`);
      
      const recentTrades = r.data.slice(-50);
      let largeBuys = 0, largeSells = 0;
      let buyVolume = 0, sellVolume = 0;
      
      // Threshold: $10,000+ trades
      const threshold = 10000;
      
      for (const trade of recentTrades) {
        const value = parseFloat(trade.price) * parseFloat(trade.qty);
        if (trade.isBuyerMaker) {
          buyVolume += value;
          if (value > threshold) largeBuys++;
        } else {
          sellVolume += value;
          if (value > threshold) largeSells++;
        }
      }
      
      return {
        symbol,
        largeBuys,
        largeSells,
        buyVolume: buyVolume.toFixed(2),
        sellVolume: sellVolume.toFixed(2),
        netPressure: buyVolume > sellVolume ? 'BUYING' : 'SELLING',
        whaleAlert: largeBuys > 5 || largeSells > 5
      };
    } catch (e) {
      return { symbol, error: e.message };
    }
  }
  
  // Full Market Analysis
  async analyzeMarket() {
    console.log('🔍 Running full market analysis...\n');
    
    const btc = await this.getBTCData();
    console.log(`BTC: $${btc?.price?.toLocaleString()} (${btc?.change24h?.toFixed(2)}%)`);
    
    const symbols = ['ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
    
    console.log('\n📊 Correlation & Order Book:');
    for (const symbol of symbols) {
      const corr = await this.getCorrelation(symbol);
      const ob = await this.getOrderBook(symbol);
      const whales = await this.checkWhales(symbol);
      
      console.log(`\n${symbol}:`);
      console.log(`  BTC Correlation: ${corr.toFixed(3)}`);
      console.log(`  Order Imbalance: ${ob.recommendation} (${ob.imbalance})`);
      console.log(`  Whales: ${whales.netPressure} (${whales.largeBuys} buys / ${whales.largeSells} sells)`);
    }
    
    return { btc, timestamp: Date.now() };
  }
}

module.exports = new MarketAnalyzer();

if (require.main === module) {
  MarketAnalyzer.analyzeMarket().then(() => process.exit(0));
}
