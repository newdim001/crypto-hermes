// CryptoEdge Chaos Protocol
// Handles unprecedented events that don't match any historical regime

const axios = require('axios');

class ChaosProtocol {
  constructor() {
    this.mode = 'NORMAL'; // NORMAL, CAUTIOUS, ULTRA_CONSERVATIVE, EMERGENCY
    this.history = [];
  }
  
  async detectChaos(marketData) {
    const anomalies = [];
    
    // Check for unprecedented price movements
    if (marketData.priceChange1h > 10) anomalies.push('EXTREME_UP');
    if (marketData.priceChange1h < -10) anomalies.push('EXTREME_DOWN');
    
    // Check for volatility spike
    if (marketData.volatility > marketData.avgVolatility * 3) anomalies.push('VOLATILITY_SPIKE');
    
    // Check for volume anomaly
    if (marketData.volume > marketData.avgVolume * 5) anomalies.push('VOLUME_SPIKE');
    
    // Check for correlation breakdown
    if (Math.abs(marketData.btcEthCorrelation) > 0.9) anomalies.push('CORRELATION_EXTREME');
    
    if (anomalies.length > 0) {
      return this.respondToChaos(anomalies);
    }
    
    return { mode: 'NORMAL', anomalies: [] };
  }
  
  respondToChaos(anomalies) {
    console.log('⚠️ CHAOS DETECTED:', anomalies.join(', '));
    
    let newMode = 'NORMAL';
    let action = 'Continue normal operations';
    
    if (anomalies.includes('EXTREME_UP') || anomalies.includes('EXTREME_DOWN')) {
      newMode = 'ULTRA_CONSERVATIVE';
      action = 'Cut all positions by 90%, widen stops to 10%';
    } else if (anomalies.includes('VOLATILITY_SPIKE')) {
      newMode = 'CAUTIOUS';
      action = 'Reduce position sizes by 50%';
    } else if (anomalies.includes('VOLUME_SPIKE')) {
      newMode = 'CAUTIOUS';
      action = 'Pause new entries, monitor closely';
    }
    
    this.mode = newMode;
    this.history.push({ timestamp: Date.now(), anomalies, mode: newMode });
    
    return { mode: newMode, action, anomalies };
  }
  
  getMode() {
    return this.mode;
  }
  
  reset() {
    this.mode = 'NORMAL';
    console.log('🔄 Chaos Protocol: Mode reset to NORMAL');
  }
}

module.exports = new ChaosProtocol();
