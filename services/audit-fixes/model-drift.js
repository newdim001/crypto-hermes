// CryptoEdge Model Drift Detection
// Monitors live performance vs backtest

class ModelDriftDetector {
  constructor() {
    this.baselineAccuracy = 0.65; // From backtesting
    this.driftThreshold = 0.10; // 10% drop triggers alert
    this.performanceHistory = [];
    this.alertLevel = 'NONE'; // NONE, WARNING, CRITICAL
  }
  
  // Record prediction outcome
  recordPrediction(symbol, prediction, actual) {
    const correct = (prediction === actual);
    this.performanceHistory.push({
      symbol,
      prediction,
      actual,
      correct,
      timestamp: Date.now()
    });
    
    // Keep last 100
    if (this.performanceHistory.length > 100) {
      this.performanceHistory.shift();
    }
    
    return this.checkDrift();
  }
  
  // Check for model drift
  checkDrift() {
    if (this.performanceHistory.length < 20) {
      return { status: 'INSUFFICIENT_DATA', drift: 0 };
    }
    
    // Calculate recent accuracy (last 20)
    const recent = this.performanceHistory.slice(-20);
    const recentAccuracy = recent.filter(p => p.correct).length / recent.length;
    
    const drift = this.baselineAccuracy - recentAccuracy;
    const driftPercent = (drift / this.baselineAccuracy) * 100;
    
    // Determine alert level
    if (driftPercent > this.driftThreshold * 100) {
      this.alertLevel = 'CRITICAL';
    } else if (driftPercent > this.driftThreshold * 50) {
      this.alertLevel = 'WARNING';
    } else {
      this.alertLevel = 'NONE';
    }
    
    return {
      baseline: (this.baselineAccuracy * 100).toFixed(1) + '%',
      recent: (recentAccuracy * 100).toFixed(1) + '%',
      drift: driftPercent.toFixed(1) + '%',
      alertLevel: this.alertLevel,
      shouldRetrain: this.alertLevel === 'CRITICAL'
    };
  }
  
  // Get performance stats
  getStats() {
    const total = this.performanceHistory.length;
    if (total === 0) return { trades: 0 };
    
    const correct = this.performanceHistory.filter(p => p.correct).length;
    return {
      trades: total,
      accuracy: (correct / total * 100).toFixed(1) + '%',
      baseline: (this.baselineAccuracy * 100).toFixed(1) + '%',
      alertLevel: this.alertLevel
    };
  }
  
  // Reset to new baseline
  recalibrate() {
    if (this.performanceHistory.length >= 20) {
      const recent = this.performanceHistory.slice(-20);
      const accuracy = recent.filter(p => p.correct).length / recent.length;
      this.baselineAccuracy = accuracy;
      this.alertLevel = 'NONE';
      return { newBaseline: accuracy };
    }
    return { error: 'Insufficient data' };
  }
}

module.exports = new ModelDriftDetector();
