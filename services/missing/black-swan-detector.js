// CryptoEdge Black Swan Detector
// Correlation breakdowns and regime changes

class BlackSwanDetector {
  constructor() {
    this.correlations = {};
    this.correlationHistory = {};
    this.breakdownThreshold = 0.3;
    this.watchlist = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  }
  
  // Monitor correlations in real-time
  async checkCorrelations(prices) {
    const warnings = [];
    
    // Calculate pairwise correlations
    for (let i = 0; i < this.watchlist.length; i++) {
      for (let j = i + 1; j < this.watchlist.length; j++) {
        const pair = `${this.watchlist[i]}-${this.watchlist[j]}`;
        const newCorr = this.calculateCorrelation(
          prices[this.watchlist[i]], 
          prices[this.watchlist[j]]
        );
        
        const oldCorr = this.correlations[pair] || newCorr;
        const change = Math.abs(newCorr - oldCorr);
        
        // Detect breakdown
        if (change > this.breakdownThreshold) {
          warnings.push({
            type: 'CORRELATION_BREAKDOWN',
            pair,
            oldValue: oldCorr.toFixed(2),
            newValue: newCorr.toFixed(2),
            change: change.toFixed(2)
          });
        }
        
        this.correlations[pair] = newCorr;
        
        // Track history
        if (!this.correlationHistory[pair]) this.correlationHistory[pair] = [];
        this.correlationHistory[pair].push({ timestamp: Date.now(), value: newCorr });
      }
    }
    
    return warnings;
  }
  
  calculateCorrelation(price1, price2) {
    if (!price1 || !price2 || price1.length < 2 || price2.length < 2) return 0;
    
    const returns1 = [];
    const returns2 = [];
    
    for (let i = 1; i < price1.length; i++) {
      returns1.push((price1[i] - price1[i-1]) / price1[i-1]);
      returns2.push((price2[i] - price2[i-2]) / price2[i-2]);
    }
    
    const mean1 = returns1.reduce((a,b) => a+b, 0) / returns1.length;
    const mean2 = returns2.reduce((a,b) => a+b, 0) / returns2.length;
    
    let num = 0, den1 = 0, den2 = 0;
    for (let i = 0; i < returns1.length; i++) {
      num += (returns1[i] - mean1) * (returns2[i] - mean2);
      den1 += Math.pow(returns1[i] - mean1, 2);
      den2 += Math.pow(returns2[i] - mean2, 2);
    }
    
    const den = Math.sqrt(den1 * den2);
    return den === 0 ? 0 : num / den;
  }
  
  // Detect regime changes
  detectRegimeChange(currentRegime, indicators) {
    const changes = [];
    
    // ADX change
    if (Math.abs(indicators.adx - indicators.prevAdx) > 15) {
      changes.push('TREND_STRENGTH_CHANGE');
    }
    
    // Volatility change
    if (indicators.volatility > indicators.avgVolatility * 2) {
      changes.push('VOLATILITY_REGIME_CHANGE');
    }
    
    // Price trend change
    if ((indicators.price > indicators.sma200 && indicators.prevPrice < indicators.prevSma200) ||
        (indicators.price < indicators.sma200 && indicators.prevPrice > indicators.prevSma200)) {
      changes.push('PRICE_REGIME_CHANGE');
    }
    
    return changes;
  }
  
  // Response to black swan
  respond(warnings) {
    if (warnings.length === 0) return { action: 'NONE' };
    
    return {
      action: 'CUT_POSITIONS',
      percentage: 90,
      reason: 'Black swan detected - correlation breakdown',
      warnings
    };
  }
}

module.exports = new BlackSwanDetector();
