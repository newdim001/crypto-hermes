// CryptoEdge BTC Dominance Tracker
// Critical for altcoin trade decisions

const https = require('https');

class BTCDominanceTracker {
  constructor() {
    this.currentDominance = null;
    this.history = [];
    this.thresholds = {
      highDominance: 55, // BTC strong, avoid alts
      lowDominance: 40,  // Alt season
      neutral: [40, 55]
    };
  }

  // Fetch current BTC dominance
  async fetch() {
    try {
      // Using CoinGecko API (free)
      const response = await this.httpGet('https://api.coingecko.com/api/v3/global');
      const data = JSON.parse(response);
      
      this.currentDominance = data.data.market_cap_percentage.btc;
      this.history.push({
        dominance: this.currentDominance,
        timestamp: Date.now()
      });
      
      // Keep last 100
      if (this.history.length > 100) this.history.shift();
      
      return {
        dominance: this.currentDominance.toFixed(2) + '%',
        regime: this.getRegime(),
        altcoinRecommendation: this.getAltcoinRecommendation()
      };
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

  // Get current regime
  getRegime() {
    if (!this.currentDominance) return 'UNKNOWN';
    
    if (this.currentDominance > this.thresholds.highDominance) {
      return 'BTC_DOMINANT';
    } else if (this.currentDominance < this.thresholds.lowDominance) {
      return 'ALT_SEASON';
    }
    return 'NEUTRAL';
  }

  // Get altcoin recommendation
  getAltcoinRecommendation() {
    const regime = this.getRegime();
    
    switch (regime) {
      case 'BTC_DOMINANT':
        return { action: 'REDUCE_ALTS', maxAltExposure: '20%', reason: 'BTC strength' };
      case 'ALT_SEASON':
        return { action: 'INCREASE_ALTS', maxAltExposure: '60%', reason: 'Alt momentum' };
      default:
        return { action: 'BALANCED', maxAltExposure: '40%', reason: 'Neutral market' };
    }
  }

  // Get trend
  getTrend() {
    if (this.history.length < 10) return 'INSUFFICIENT_DATA';
    
    const recent = this.history.slice(-10);
    const oldest = recent[0].dominance;
    const newest = recent[recent.length - 1].dominance;
    const change = newest - oldest;
    
    if (change > 2) return 'BTC_GAINING';
    if (change < -2) return 'ALTS_GAINING';
    return 'STABLE';
  }

  // Get stats
  getStats() {
    return {
      current: this.currentDominance?.toFixed(2) + '%' || 'N/A',
      regime: this.getRegime(),
      trend: this.getTrend(),
      dataPoints: this.history.length
    };
  }
}

module.exports = new BTCDominanceTracker();
