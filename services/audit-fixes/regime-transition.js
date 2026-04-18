// CryptoEdge Regime Transition Detector
// Early warning when market changes regime

class RegimeTransitionDetector {
  constructor() {
    this.currentRegime = 'UNKNOWN';
    this.transitionCount = 0;
    this.lastTransition = null;
    this.history = [];
  }
  
  // Detect regime change
  detect(currentIndicators, previousIndicators) {
    const signals = [];
    
    // ADX change
    if (previousIndicators.adx) {
      const adxChange = Math.abs(currentIndicators.adx - previousIndicators.adx);
      if (adxChange > 15) {
        signals.push({ type: 'ADX_CHANGE', severity: 'HIGH', value: adxChange });
      }
    }
    
    // Volatility change
    if (previousIndicators.volatility) {
      const volChange = currentIndicators.volatility / previousIndicators.volatility;
      if (volChange > 2) {
        signals.push({ type: 'VOLATILITY_SPIKE', severity: 'HIGH', value: volChange });
      } else if (volChange < 0.5) {
        signals.push({ type: 'VOLATILITY_DROP', severity: 'MEDIUM', value: volChange });
      }
    }
    
    // Price vs SMA cross
    if (previousIndicators.price && previousIndicators.sma200) {
      const wasAbove = previousIndicators.price > previousIndicators.sma200;
      const isAbove = currentIndicators.price > currentIndicators.sma200;
      if (wasAbove !== isAbove) {
        signals.push({ type: 'MA_CROSS', severity: 'HIGH', value: isAbove ? 'BULL' : 'BEAR' });
      }
    }
    
    // RSI extreme
    if (currentIndicators.rsi < 30 || currentIndicators.rsi > 70) {
      signals.push({ type: 'RSI_EXTREME', severity: 'MEDIUM', value: currentIndicators.rsi });
    }
    
    // Determine if transitioning
    const isTransitioning = signals.filter(s => s.severity === 'HIGH').length > 0;
    
    if (isTransitioning && signals.length > 0) {
      this.transitionCount++;
      this.lastTransition = Date.now();
    }
    
    return {
      isTransitioning,
      signals,
      confidence: isTransitioning ? signals.length * 20 : 0,
      recommendation: isTransitioning ? 'REDUCE_SIZE' : 'NORMAL'
    };
  }
  
  // Get transition stats
  getStats() {
    return {
      currentRegime: this.currentRegime,
      transitions: this.transitionCount,
      lastTransition: this.lastTransition,
      history: this.history.slice(-10)
    };
  }
}

module.exports = new RegimeTransitionDetector();
