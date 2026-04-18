// CryptoEdge Open Interest Analysis
// Monitor futures market health

const https = require('https');

class OpenInterestAnalyzer {
  constructor() {
    this.data = new Map();
    this.alerts = [];
  }

  // Fetch open interest from Binance
  async fetch(symbol) {
    try {
      const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`;
      const response = await this.httpGet(url);
      const data = JSON.parse(response);
      
      const oi = parseFloat(data.openInterest);
      const prev = this.data.get(symbol);
      
      this.data.set(symbol, {
        openInterest: oi,
        timestamp: Date.now(),
        change: prev ? ((oi - prev.openInterest) / prev.openInterest * 100) : 0
      });
      
      return this.analyze(symbol);
    } catch (e) {
      return { error: e.message };
    }
  }

  // HTTP GET helper
  httpGet(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  // Analyze OI data
  analyze(symbol) {
    const current = this.data.get(symbol);
    if (!current) return { error: 'No data' };
    
    let signal = 'NEUTRAL';
    let risk = 'NORMAL';
    
    // Large OI increase with price up = bullish
    // Large OI increase with price down = bearish
    // Large OI decrease = liquidations happening
    
    if (Math.abs(current.change) > 10) {
      signal = current.change > 0 ? 'BUILDING' : 'UNWINDING';
      risk = 'ELEVATED';
    }
    
    if (Math.abs(current.change) > 20) {
      signal = current.change > 0 ? 'EXTREME_BUILDING' : 'CASCADING_LIQUIDATIONS';
      risk = 'HIGH';
      this.alerts.push({ symbol, signal, timestamp: Date.now() });
    }
    
    return {
      symbol,
      openInterest: current.openInterest,
      change: current.change.toFixed(2) + '%',
      signal,
      risk,
      recommendation: this.getRecommendation(signal)
    };
  }

  // Get recommendation
  getRecommendation(signal) {
    switch (signal) {
      case 'EXTREME_BUILDING':
        return 'Caution: Potential for large move. Reduce leverage.';
      case 'CASCADING_LIQUIDATIONS':
        return 'Stay out: Liquidation cascade in progress.';
      case 'BUILDING':
        return 'Trend strengthening. Follow momentum.';
      case 'UNWINDING':
        return 'Positions closing. Expect volatility.';
      default:
        return 'Normal conditions.';
    }
  }

  // Get all data
  getAll() {
    const result = {};
    for (const [symbol, data] of this.data) {
      result[symbol] = {
        oi: data.openInterest,
        change: data.change.toFixed(2) + '%'
      };
    }
    return result;
  }

  // Get recent alerts
  getAlerts() {
    return this.alerts.slice(-10);
  }
}

module.exports = new OpenInterestAnalyzer();
