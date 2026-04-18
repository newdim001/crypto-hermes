// CryptoEdge Funding Rate Monitor
const axios = require('axios');

class FundingMonitor {
  constructor() {
    this.rates = {};
    this.history = [];
  }
  
  async getFundingRate(symbol) {
    try {
      const r = await axios.get(`https://testnet.binance.vision/api/v3/premiumIndex?symbol=${symbol}`);
      const data = r.data;
      const fundingRate = parseFloat(data.lastFundingRate);
      const nextFunding = parseFloat(data.nextFundingTime);
      
      this.rates[symbol] = { rate: fundingRate, nextFunding, time: Date.now() };
      return { rate: fundingRate, nextFunding, symbol };
    } catch (e) {
      return { rate: 0.0001, nextFunding: null, symbol, error: e.message };
    }
  }
  
  async getAllRates(symbols) {
    const results = {};
    for (const symbol of symbols) {
      results[symbol] = await this.getFundingRate(symbol);
    }
    return results;
  }
  
  // Check if funding payment is coming
  timeToFunding(nextFunding) {
    if (!nextFunding) return 'Unknown';
    const ms = nextFunding - Date.now();
    const hours = ms / (1000 * 60 * 60);
    return hours.toFixed(1) + ' hours';
  }
}

module.exports = new FundingMonitor();
