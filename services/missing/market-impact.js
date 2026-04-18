// CryptoEdge Market Impact Model
// Predicts how trading affects prices

class MarketImpactModel {
  constructor() {
    this.impactHistory = [];
  }
  
  // Analyze market depth
  async getDepth(symbol) {
    try {
      const axios = require('axios');
      const r = await axios.get(`https://testnet.binance.vision/api/v3/depth?symbol=${symbol}&limit=20`);
      
      const bids = r.data.bids.map(b => ({ price: parseFloat(b[0]), qty: parseFloat(b[1]) }));
      const asks = r.data.asks.map(a => ({ price: parseFloat(a[0]), qty: parseFloat(a[1]) }));
      
      const bidVolume = bids.reduce((s, b) => s + b.price * b.qty, 0);
      const askVolume = asks.reduce((s, a) => s + a.price * a.qty, 0);
      
      return { bids, asks, bidVolume, askVolume, spread: asks[0].price - bids[0].price };
    } catch (e) {
      return null;
    }
  }
  
  // Estimate slippage for order size
  estimateImpact(orderSizeUSD, depth) {
    if (!depth) return { estimatedSlippage: 0, recommendation: 'USE_MARKET' };
    
    const { bidVolume, askVolume, spread } = depth;
    const totalVolume = bidVolume + askVolume;
    
    // Size as % of available liquidity
    const sizePercent = orderSizeUSD / totalVolume;
    
    let slippage = 0;
    let recommendation = 'USE_MARKET';
    
    if (sizePercent > 0.1) { // >10% of liquidity
      slippage = sizePercent * 0.1; // Rough estimate
      recommendation = 'SPLIT_ORDER';
    } else if (sizePercent > 0.01) { // >1%
      slippage = sizePercent * 0.05;
      recommendation = 'USE_LIMIT';
    }
    
    return {
      estimatedSlippage: (slippage * 100).toFixed(3) + '%',
      sizePercent: (sizePercent * 100).toFixed(2) + '%',
      recommendation,
      spread: spread.toFixed(2)
    };
  }
  
  // Optimize execution strategy
  optimizeExecution(orderSizeUSD, confidence, volatility) {
    const strategies = [];
    
    // Market order
    strategies.push({
      type: 'MARKET',
      slippage: '0.1-0.3%',
      timing: 'Immediate',
      suitable: confidence > 80 && volatility < 2
    });
    
    // Limit order
    strategies.push({
      type: 'LIMIT',
      slippage: '0-0.1%',
      timing: 'Patient',
      suitable: confidence < 60
    });
    
    // TWAP (Time-weighted average price)
    strategies.push({
      type: 'TWAP',
      slippage: '0.05-0.2%',
      timing: 'Spread over time',
      suitable: orderSizeUSD > 10000
    });
    
    // Iceberg
    strategies.push({
      type: 'ICEBERG',
      slippage: '0.1-0.3%',
      timing: 'Hidden',
      suitable: orderSizeUSD > 50000
    });
    
    // Select best
    return strategies.filter(s => s.suitable)[0] || strategies[0];
  }
  
  // Track actual vs predicted
  recordImpact(predicted, actual) {
    this.impactHistory.push({ timestamp: Date.now(), predicted, actual });
    if (this.impactHistory.length > 100) this.impactHistory.shift();
  }
  
  getAccuracy() {
    if (this.impactHistory.length < 10) return { samples: this.impactHistory.length };
    
    let error = 0;
    for (const h of this.impactHistory) {
      error += Math.abs(h.predicted - h.actual);
    }
    
    return {
      samples: this.impactHistory.length,
      avgError: (error / this.impactHistory.length).toFixed(4) + '%'
    };
  }
}

module.exports = new MarketImpactModel();
