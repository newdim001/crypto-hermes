// CryptoEdge Data Validation Layer
// Validates all market data before trading

class DataValidator {
  constructor() {
    this.maxLatencyMs = 5000;
    this.maxPriceChangePercent = 50;
    this.requiredFields = ['price', 'volume', 'timestamp'];
    this.anomalies = [];
  }
  
  // Validate single data point
  validate(data, source = 'unknown') {
    const errors = [];
    const warnings = [];
    
    // Check required fields
    for (const field of this.requiredFields) {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing field: ${field}`);
      }
    }
    
    // Check price is positive
    if (data.price <= 0) errors.push('Invalid price: must be positive');
    
    // Check price not too old
    if (data.timestamp) {
      const age = Date.now() - data.timestamp;
      if (age > this.maxLatencyMs) {
        warnings.push(`Data latency: ${(age/1000).toFixed(1)}s (max ${this.maxLatencyMs/1000}s)`);
      }
    }
    
    // Check volume not zero
    if (data.volume <= 0) warnings.push('Zero volume');
    
    // Check price not extreme change
    if (data.price && data.prevPrice) {
      const change = Math.abs((data.price - data.prevPrice) / data.prevPrice * 100);
      if (change > this.maxPriceChangePercent) {
        errors.push(`Extreme price change: ${change.toFixed(1)}%`);
      }
    }
    
    const result = {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: Date.now(),
      source
    };
    
    if (!result.valid) {
      this.anomalies.push(result);
    }
    
    return result;
  }
  
  // Validate OHLCV data
  validateOHLCV(kline) {
    const errors = [];
    
    if (parseFloat(kline[2]) < parseFloat(kline[3])) {
      errors.push('High < Low (invalid candle)');
    }
    if (parseFloat(kline[4]) < 0 || parseFloat(kline[5]) < 0) {
      errors.push('Negative price or volume');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  // Get anomaly history
  getAnomalies() {
    return this.anomalies.slice(-50);
  }
  
  // Clear history
  clearAnomalies() {
    this.anomalies = [];
  }
}

module.exports = new DataValidator();
