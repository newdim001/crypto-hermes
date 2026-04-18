// CryptoEdge Sentiment Analyzer - FIXED
const axios = require('axios');

class SentimentAnalyzer {
  async calculateFearGreed(btcPrice) {
    try {
      const r = await axios.get('https://testnet.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168');
      const closes = r.data.map(k => parseFloat(k[4]));
      const volumes = r.data.map(k => parseFloat(k[5]));
      
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i-1]) / closes[i-1]);
      }
      
      const avgReturn = returns.reduce((a,b) => a+b, 0) / returns.length;
      const volatility = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length);
      
      const recentVol = volumes.slice(-24).reduce((a,b) => a+b, 0);
      const oldVol = volumes.slice(-168, -24).reduce((a,b) => a+b, 0) / 7;
      const volMomentum = recentVol / oldVol;
      
      let score = 50;
      if (volatility > 0.02) score -= 20;
      else if (volatility > 0.01) score -= 10;
      if (volMomentum > 1.5) score += 20;
      else if (volMomentum > 1.2) score += 10;
      
      const priceChange = (closes[closes.length-1] - closes[closes.length-24]) / closes[closes.length-24];
      if (priceChange > 0.05) score += 15;
      else if (priceChange > 0.02) score += 5;
      else if (priceChange < -0.05) score -= 15;
      else if (priceChange < -0.02) score -= 5;
      
      score = Math.max(0, Math.min(100, score));
      
      let label = 'NEUTRAL';
      if (score < 25) label = 'EXTREME_FEAR';
      else if (score < 45) label = 'FEAR';
      else if (score > 75) label = 'EXTREME_GREED';
      else if (score > 55) label = 'GREED';
      
      return { score: Math.round(score), label, volatility: (volatility*100).toFixed(2), volMomentum: volMomentum.toFixed(2) };
    } catch (e) {
      return { score: 50, label: 'UNKNOWN', error: e.message };
    }
  }
  
  async analyzeAll() {
    console.log('😰 Analyzing market sentiment...\n');
    const btc = await axios.get('https://testnet.binance.vision/api/v3/ticker/price?symbol=BTCUSDT');
    const btcPrice = parseFloat(btc.data.price);
    const fearGreed = await this.calculateFearGreed(btcPrice);
    
    console.log('BTC Price: $' + btcPrice.toLocaleString());
    console.log('Fear & Greed: ' + fearGreed.score + ' (' + fearGreed.label + ')');
    
    let recommendation = 'HOLD';
    if (fearGreed.score < 25) recommendation = 'BUY';
    else if (fearGreed.score > 75) recommendation = 'SELL';
    
    console.log('Recommendation: ' + recommendation);
    return { fearGreed, recommendation, btcPrice };
  }
}

const sentimentAnalyzer = new SentimentAnalyzer();
module.exports = sentimentAnalyzer;

if (require.main === module) {
  sentimentAnalyzer.analyzeAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
