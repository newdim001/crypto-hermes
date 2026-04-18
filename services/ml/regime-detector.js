// CryptoEdge Market Regime Detector
// Detects trending/ranging/volatile market conditions

const axios = require('axios');

class RegimeDetector {
  
  // ADX (Average Directional Index) - Trend Strength
  calculateADX(highs, lows, closes, period = 14) {
    if (highs.length < period * 2) return { adx: 0, plusDI: 0, minusDI: 0 };
    
    let plusDM = [], minusDM = [], tr = [];
    
    for (let i = 1; i < highs.length; i++) {
      const upMove = highs[i] - highs[i-1];
      const downMove = lows[i-1] - lows[i];
      
      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
      
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i-1]),
        Math.abs(lows[i] - closes[i-1])
      ));
    }
    
    const avgTR = this.sma(tr, period);
    const avgPlusDM = this.sma(plusDM, period);
    const avgMinusDM = this.sma(minusDM, period);
    
    const plusDI = avgTR ? (avgPlusDM / avgTR) * 100 : 0;
    const minusDI = avgTR ? (avgMinusDM / avgTR) * 100 : 0;
    
    const diSum = plusDI + minusDI;
    const dx = diSum ? ((plusDI - minusDI) / diSum) * 100 : 0;
    
    return { adx: dx, plusDI, minusDI };
  }
  
  sma(data, period) {
    if (data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
  
  // MFI (Money Flow Index)
  calculateMFI(highs, lows, closes, volumes, period = 14) {
    if (highs.length < period + 1) return 50;
    
    let typicalPrices = [];
    let moneyFlow = [];
    
    for (let i = 0; i < highs.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      typicalPrices.push(tp);
      moneyFlow.push(tp * volumes[i]);
    }
    
    let posFlow = 0, negFlow = 0;
    for (let i = typicalPrices.length - period; i < typicalPrices.length; i++) {
      if (typicalPrices[i] > typicalPrices[i-1]) posFlow += moneyFlow[i];
      else negFlow += moneyFlow[i];
    }
    
    if (negFlow === 0) return 100;
    const ratio = posFlow / negFlow;
    return 100 - (100 / (1 + ratio));
  }
  
  // OBV (On-Balance Volume)
  calculateOBV(closes, volumes) {
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i-1]) obv += volumes[i];
      else if (closes[i] < closes[i-1]) obv -= volumes[i];
    }
    return obv;
  }
  
  // Ichimoku Cloud
  calculateIchimoku(highs, lows, closes) {
    const len = highs.length;
    if (len < 52) return null;
    
    const high9 = Math.max(...highs.slice(-9));
    const low9 = Math.min(...highs.slice(-9));
    const tenkan = (high9 + low9) / 2;
    
    const high26 = Math.max(...highs.slice(-26));
    const low26 = Math.min(...highs.slice(-26));
    const kijun = (high26 + low26) / 2;
    
    const senkouA = (tenkan + kijun) / 2;
    
    const high52 = Math.max(...highs.slice(-52));
    const low52 = Math.min(...highs.slice(-52));
    const senkouB = (high52 + low52) / 2;
    
    return { tenkan, kijun, senkouA, senkouB, cloudTop: Math.max(senkouA, senkouB), cloudBottom: Math.min(senkouA, senkouB) };
  }
  
  // Detect Market Regime
  async detectRegime(symbol) {
    try {
      const r = await axios.get(`https://testnet.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`);
      
      const highs = r.data.map(k => parseFloat(k[2]));
      const lows = r.data.map(k => parseFloat(k[3]));
      const closes = r.data.map(k => parseFloat(k[4]));
      const volumes = r.data.map(k => parseFloat(k[5]));
      
      // Calculate indicators
      const adx = this.calculateADX(highs, lows, closes);
      const mfi = this.calculateMFI(highs, lows, closes, volumes);
      const obv = this.calculateOBV(closes, volumes);
      const ichimoku = this.calculateIchimoku(highs, lows, closes);
      
      // Current price position
      const currentPrice = closes[closes.length - 1];
      const sma20 = this.sma(closes, 20);
      const sma50 = this.sma(closes, 50);
      const sma200 = this.sma(closes, 200);
      
      // Determine regime
      let regime = 'UNKNOWN';
      let strategy = 'HOLD';
      let risk = 'MEDIUM';
      
      if (adx.adx > 25) {
        if (currentPrice > sma200) {
          regime = 'TRENDING_BULL';
          strategy = 'BUY_DIPS';
          risk = 'LOW';
        } else {
          regime = 'TRENDING_BEAR';
          strategy = 'SHORT_RALLIES';
          risk = 'HIGH';
        }
      } else if (adx.adx < 15) {
        regime = 'RANGING';
        strategy = 'RANGE_TRADE';
        risk = 'MEDIUM';
      }
      
      // High volatility check
      const atr = this.calculateATR(highs, lows, closes);
      const avgPrice = this.sma(closes, 20);
      const volatility = (atr / avgPrice) * 100;
      
      if (volatility > 5) {
        regime = 'HIGH_VOLATILITY';
        strategy = 'REDUCE_SIZE';
        risk = 'VERY_HIGH';
      } else if (volatility < 1) {
        regime = 'LOW_VOLATILITY';
        strategy = 'SCALP';
        risk = 'LOW';
      }
      
      return {
        symbol,
        regime,
        strategy,
        risk,
        indicators: {
          adx: adx.adx.toFixed(1),
          mfi: mfi.toFixed(1),
          obv: obv.toFixed(0),
          volatility: volatility.toFixed(2),
          price: currentPrice,
          sma20: sma20?.toFixed(2),
          sma50: sma50?.toFixed(2),
          sma200: sma200?.toFixed(2),
          above200MA: currentPrice > sma200
        }
      };
    } catch (e) {
      return { symbol, error: e.message };
    }
  }
  
  calculateATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 0;
    let tr = [];
    for (let i = 1; i < highs.length; i++) {
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
    }
    return this.sma(tr, period);
  }
  
  async analyzeAll() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'POLUSDT'];
    const results = [];
    
    for (const symbol of symbols) {
      const analysis = await this.detectRegime(symbol);
      results.push(analysis);
      console.log(`  ${symbol}: ${analysis.regime} (${analysis.risk} risk)`);
    }
    
    return results;
  }
}

const RegimeDetector = new RegimeDetector();
RegimeDetector.analyzeAll = async function() { return this.analyzeAll(); };
module.exports = RegimeDetector;;

if (require.main === module) {
  RegimeDetector.analyzeAll().then(r => {
    console.log('\n✅ Regime analysis complete');
    process.exit(0);
  });
}
