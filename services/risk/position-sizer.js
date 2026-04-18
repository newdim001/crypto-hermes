// CryptoEdge Dynamic Position Sizer

class PositionSizer {
  
  // Fixed Kelly: use edge-based sizing
  calculateSize(winRate, avgWin, avgLoss, balance) {
    const W = winRate / 100;
    const R = avgWin / (avgLoss || 1);
    const edge = W * R - (1 - W);
    
    if (edge <= 0) return balance * 0.01; // Minimum
    
    const kelly = Math.min(edge, 0.25); // Cap at 25%
    return balance * kelly;
  }
  
  // Volatility adjustment
  adjustForVolatility(currentATR, avgATR, size) {
    const ratio = currentATR / (avgATR || 1);
    if (ratio > 2) return size * 0.25;
    if (ratio > 1.5) return size * 0.5;
    if (ratio > 1) return size * 0.75;
    return size;
  }
  
  // Confidence adjustment
  adjustForConfidence(confidence, size) {
    return size * (confidence / 100);
  }
  
  // Regime adjustment
  adjustForRegime(regime, size) {
    const mods = { 'TRENDING_BULL': 1, 'TRENDING_BEAR': 0.5, 'RANGING': 0.75, 'HIGH_VOLATILITY': 0.25, 'LOW_VOLATILITY': 1.25 };
    return size * (mods[regime] || 1);
  }
  
  // Main calculation
  calculate(params) {
    const { balance = 10000, winRate = 55, avgWin = 150, avgLoss = 100, currentATR = 1, avgATR = 1, confidence = 50, regime = 'RANGING', maxPosition = 0.10 } = params;
    
    let size = this.calculateSize(winRate, avgWin, avgLoss, balance);
    size = this.adjustForVolatility(currentATR, avgATR, size);
    size = this.adjustForConfidence(confidence, size);
    size = this.adjustForRegime(regime, size);
    size = Math.min(size, balance * maxPosition);
    
    return {
      dollar: size.toFixed(2),
      percent: (size / balance * 100).toFixed(2),
      Kelly: 'Quarter-Kelly',
      volatility: currentATR > avgATR ? 'REDUCED' : 'NORMAL',
      confidence: confidence + '%'
    };
  }
}

module.exports = new PositionSizer();

if (require.main === module) {
  const sizer = new PositionSizer();
  console.log('Test:', sizer.calculate({ balance: 10000, regime: 'TRENDING_BULL', confidence: 80 }));
}
