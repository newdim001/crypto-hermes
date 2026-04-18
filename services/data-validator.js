/**
 * CryptoEdge Data Validation Layer
 * Validates all incoming market data before trading decisions
 */

const axios = require('axios');

// ============================================
// VALIDATION CONFIGURATION
// ============================================

const VALIDATION_CONFIG = {
  // Price validation
  maxPriceChangePercent: 10,     // Max 10% change in 1 minute
  maxVolumeChangePercent: 500,   // Max 500% volume spike
  minLiquidityUSD: 10000,       // Min $10k daily volume
  
  // Data freshness
  maxDataAgeMs: 60000,          // Data must be < 60 seconds old
  staleDataThresholdMs: 30000,  // Warn if data > 30 seconds old
  
  // Historical bounds
  minPrice: 0.0001,
  maxPrice: 1000000,
  
  // Required fields
  requiredFields: ['open', 'high', 'low', 'close', 'volume', 'time'],
  
  // Anomaly detection
  outlierStdDev: 5,             // Flag if > 5 std devs from mean
  
  // Fallback behavior
  useFallbackOnFailure: true,
  fallbackSource: 'cache'       // 'cache' or 'secondary_exchange'
};

// Data cache for fallback
let priceCache = new Map();
const CACHE_MAX_SIZE = 100;

class DataValidator {
  constructor(config = {}) {
    this.config = { ...VALIDATION_CONFIG, ...config };
    this.validationErrors = [];
    this.anomalies = [];
  }
  
  // ============================================
  // CORE VALIDATION METHODS
  // ============================================
  
  validateOHLCV(candle, symbol) {
    const errors = [];
    
    // Check required fields
    for (const field of this.config.requiredFields) {
      if (candle[field] === undefined || candle[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    if (errors.length > 0) return { valid: false, errors };
    
    // Validate price relationships
    if (candle.high < candle.low) {
      errors.push('High price is less than low price');
    }
    if (candle.close > candle.high || candle.close < candle.low) {
      errors.push('Close price outside high-low range');
    }
    if (candle.open > candle.high || candle.open < candle.low) {
      errors.push('Open price outside high-low range');
    }
    
    // Validate price bounds
    if (candle.close < this.config.minPrice || candle.close > this.config.maxPrice) {
      errors.push(`Close price ${candle.close} outside valid range`);
    }
    
    // Validate volume - only check if we have cached data
    if (candle.volume < 0) {
      errors.push('Negative volume');
    }
    const cachedData = priceCache.get(symbol);
    if (cachedData && cachedData.volume > 0) {
      if (candle.volume > this.config.maxVolumeChangePercent * cachedData.volume) {
        errors.push(`Volume spike detected: ${(candle.volume/cachedData.volume).toFixed(2)}x`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      data: candle
    };
  }
  
  validatePrice(currentPrice, previousPrice, symbol) {
    const errors = [];
    const warnings = [];
    
    if (!currentPrice || currentPrice <= 0) {
      errors.push('Invalid price: must be positive');
      return { valid: false, errors, warnings };
    }
    
    // Check price change
    if (previousPrice && previousPrice > 0) {
      const changePercent = Math.abs((currentPrice - previousPrice) / previousPrice * 100);
      
      if (changePercent > this.config.maxPriceChangePercent) {
        errors.push(`Price change ${changePercent.toFixed(2)}% exceeds max ${this.config.maxPriceChangePercent}%`);
      } else if (changePercent > this.config.maxPriceChangePercent / 2) {
        warnings.push(`Large price change: ${changePercent.toFixed(2)}%`);
      }
    }
    
    // Check against cached price (detect flash crashes/spikes)
    const cachedPrice = priceCache.get(symbol);
    if (cachedPrice) {
      const cachedChange = Math.abs((currentPrice - cachedPrice.price) / cachedPrice.price * 100);
      if (cachedChange > this.config.maxPriceChangePercent) {
        errors.push(`Price deviation from cache: ${cachedChange.toFixed(2)}%`);
      }
    }
    
    // Check price within historical bounds
    if (currentPrice < this.config.minPrice || currentPrice > this.config.maxPrice) {
      errors.push(`Price ${currentPrice} outside configured bounds`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      currentPrice,
      changePercent: previousPrice ? ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2) : 0
    };
  }
  
  validateTimestamp(timestamp, source = 'unknown') {
    const errors = [];
    const warnings = [];
    
    const now = Date.now();
    const age = now - timestamp;
    
    if (age < 0) {
      errors.push('Future timestamp detected - possible clock issue');
    }
    
    if (age > this.config.maxDataAgeMs) {
      errors.push(`Data too old: ${(age/1000).toFixed(1)}s (max: ${this.config.maxDataAgeMs/1000}s)`);
    } else if (age > this.config.staleDataThresholdMs) {
      warnings.push(`Data stale: ${(age/1000).toFixed(1)}s`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      ageMs: age,
      source
    };
  }
  
  // ============================================
  // ANOMALY DETECTION
  // ============================================
  
  detectAnomaly(symbol, currentValue, historicalValues) {
    if (!historicalValues || historicalValues.length < 10) {
      return { isAnomaly: false, reason: 'Insufficient historical data' };
    }
    
    // Calculate mean and standard deviation
    const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
    const stdDev = Math.sqrt(
      historicalValues.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / historicalValues.length
    );
    
    const zScore = Math.abs((currentValue - mean) / stdDev);
    
    if (zScore > this.config.outlierStdDev) {
      const anomaly = {
        symbol,
        currentValue,
        mean,
        stdDev,
        zScore: zScore.toFixed(2),
        type: currentValue > mean ? 'SPIKE' : 'DROP',
        timestamp: Date.now()
      };
      
      this.anomalies.push(anomaly);
      if (this.anomalies.length > 100) this.anomalies.shift();
      
      return { isAnomaly: true, ...anomaly };
    }
    
    return { isAnomaly: false, zScore: zScore.toFixed(2) };
  }
  
  // ============================================
  // DATA SOURCE VALIDATION
  // ============================================
  
  async validateDataSource(symbol) {
    const results = {
      primary: { valid: false, latency: 0, errors: [] },
      fallback: { valid: false, latency: 0, errors: [] }
    };
    
    // Test primary source (Binance)
    const startPrimary = Date.now();
    try {
      const response = await axios.get(
        `https://testnet.binance.vision/api/v3/ticker/24hr?symbol=${symbol}`,
        { timeout: 5000 }
      );
      results.primary.latency = Date.now() - startPrimary;
      results.primary.valid = response.data && response.data.lastPrice;
    } catch (e) {
      results.primary.errors.push(e.message);
    }
    
    // If primary fails, try fallback
    if (!results.primary.valid && this.config.useFallbackOnFailure) {
      const startFallback = Date.now();
      try {
        // Try CoinGecko as fallback
        const coinId = this.symbolToCoinGecko(symbol);
        if (coinId) {
          const response = await axios.get(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
            { timeout: 10000 }
          );
          results.fallback.latency = Date.now() - startFallback;
          results.fallback.valid = response.data && response.data[coinId];
        }
      } catch (e) {
        results.fallback.errors.push(e.message);
      }
    }
    
    return results;
  }
  
  symbolToCoinGecko(symbol) {
    const map = {
      'BTCUSDT': 'bitcoin',
      'ETHUSDT': 'ethereum',
      'BNBUSDT': 'binancecoin',
      'SOLUSDT': 'solana',
      'XRPUSDT': 'ripple',
      'ADAUSDT': 'cardano',
      'DOGEUSDT': 'dogecoin',
      'AVAXUSDT': 'avalanche-2',
      'DOTUSDT': 'polkadot',
      'POLUSDT': 'polygon'
    };
    return map[symbol];
  }
  
  // ============================================
  // CACHE MANAGEMENT
  // ============================================
  
  updateCache(symbol, data) {
    priceCache.set(symbol, {
      ...data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (priceCache.size > CACHE_MAX_SIZE) {
      const firstKey = priceCache.keys().next().value;
      priceCache.delete(firstKey);
    }
  }
  
  getCachedPrice(symbol) {
    const cached = priceCache.get(symbol);
    if (!cached) return null;
    
    // Check if cache is stale
    if (Date.now() - cached.timestamp > this.config.maxDataAgeMs) {
      return null;
    }
    
    return cached;
  }
  
  // ============================================
  // COMPREHENSIVE VALIDATION
  // ============================================
  
  async validateForTrading(symbol, price, candles = []) {
    const result = {
      canTrade: false,
      errors: [],
      warnings: [],
      confidence: 0,
      checks: {}
    };
    
    // 1. Validate price
    const cached = this.getCachedPrice(symbol);
    const prevPrice = cached?.close || (candles.length > 1 ? candles[candles.length - 2].close : null);
    
    const priceValidation = this.validatePrice(price, prevPrice, symbol);
    result.checks.price = priceValidation;
    result.errors.push(...priceValidation.errors);
    result.warnings.push(...priceValidation.warnings);
    
    // 2. Validate candles if provided
    if (candles.length > 0) {
      for (const candle of candles.slice(-5)) { // Check last 5
        const candleValidation = this.validateOHLCV(candle, symbol);
        if (!candleValidation.valid) {
          result.errors.push(...candleValidation.errors.map(e => `Candle: ${e}`));
        }
      }
    }
    
    // 3. Check for anomalies
    if (candles.length >= 20) {
      const historicalPrices = candles.slice(-20).map(c => c.close);
      const anomaly = this.detectAnomaly(symbol, price, historicalPrices);
      result.checks.anomaly = anomaly;
      if (anomaly.isAnomaly) {
        result.warnings.push(`Anomaly detected: ${anomaly.type} (z-score: ${anomaly.zScore})`);
      }
    }
    
    // 4. Validate data source
    const sourceValidation = await this.validateDataSource(symbol);
    result.checks.source = sourceValidation;
    if (!sourceValidation.primary.valid) {
      result.errors.push('Primary data source unavailable');
    }
    
    // Calculate confidence (0-100)
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;
    
    if (errorCount === 0 && warningCount === 0) {
      result.confidence = 100;
    } else if (errorCount === 0) {
      result.confidence = Math.max(50, 100 - warningCount * 10);
    } else {
      result.confidence = Math.max(0, 50 - errorCount * 15);
    }
    
    // Final decision
    result.canTrade = result.errors.length === 0 && result.confidence >= 70;
    
    // Update cache
    this.updateCache(symbol, { close: price, volume: candles[candles.length - 1]?.volume || 0 });
    
    return result;
  }
  
  // ============================================
  // UTILITY METHODS
  // ============================================
  
  getValidationStats() {
    return {
      cacheSize: priceCache.size,
      anomaliesDetected: this.anomalies.length,
      recentAnomalies: this.anomalies.slice(-10)
    };
  }
  
  clearCache() {
    priceCache.clear();
  }
  
  reset() {
    this.validationErrors = [];
    this.anomalies = [];
    this.clearCache();
  }
}

module.exports = { DataValidator, VALIDATION_CONFIG };
