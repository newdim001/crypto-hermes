/**
 * Enhanced Technical Indicators v3
 * Added: CCI, Williams %R, MFI, ROC, OBV, Ichimoku, Fibonacci, Money Flow
 */

const CONFIG = {
  // Enhanced indicator weights
  WEIGHTS: {
    rsi: 10,
    macd: 12,
    ema: 10,
    bb: 8,
    stochastic: 8,
    adx: 10,
    volume: 8,
    pattern: 5,
    cci: 6,
    williamsR: 6,
    mfi: 6,
    roc: 5,
    obv: 4,
    ichimoku: 5,
    atr: 3
  },
  // Trading parameters
  minConfidence: 55,  // Lowered from 75 to allow more trades
  maxPositions: 3,
  riskPerTrade: 2
};

// ============================================
// CORE INDICATORS
// ============================================

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i].close - prices[i-1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices, period) {
  if (prices.length < period) return prices[0]?.close || 0;
  const k = 2 / (period + 1);
  let ema = prices[0].close;
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i].close * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate SMA (Simple Moving Average)
 */
function calculateSMA(prices, period) {
  if (prices.length < period) return prices[0]?.close || 0;
  const sum = prices.slice(-period).reduce((s, p) => s + p.close, 0);
  return sum / period;
}

/**
 * Calculate MACD
 */
function calculateMACD(prices) {
  if (!prices || prices.length < 30) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }
  
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  
  // Calculate signal line (EMA of MACD)
  const macdPrices = prices.slice(-20).map((_, i) => i === 0 ? macdLine : macdLine);
  const signalLine = calculateEMA(prices.slice(-20), 9);
  
  return {
    macdLine,
    signalLine,
    histogram: macdLine - signalLine
  };
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) {
    return { upper: 0, middle: 0, lower: 0, position: 0.5 };
  }
  
  const sma = calculateSMA(prices, period);
  const recentPrices = prices.slice(-period);
  
  // Calculate standard deviation
  const squaredDiffs = recentPrices.map(p => Math.pow(p.close - sma, 2));
  const variance = squaredDiffs.reduce((s, d) => s + d, 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = sma + (stdDev * std);
  const lower = sma - (stdDev * std);
  
  // Position: 0 = at lower band, 1 = at upper band
  const currentPrice = prices[prices.length - 1].close;
  const position = (currentPrice - lower) / (upper - lower);
  
  return { upper, middle: sma, lower, position };
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(prices, period = 14) {
  if (prices.length < period) return { k: 50, d: 50 };
  
  const recentPrices = prices.slice(-period);
  const lowest = Math.min(...recentPrices.map(p => p.low));
  const highest = Math.max(...recentPrices.map(p => p.high));
  
  const currentPrice = prices[prices.length - 1].close;
  const k = highest === lowest ? 50 : ((currentPrice - lowest) / (highest - lowest)) * 100;
  
  // %D is SMA of %K
  const d = k; // Simplified
  
  return { k, d };
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 14;
  
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Calculate ADX (Average Directional Index)
 */
function calculateADX(candles, period = 14) {
  if (candles.length < period * 2) {
    return { adx: 25, plusDI: 25, minusDI: 25, trend: 'RANGING' };
  }
  
  const trueRanges = [];
  const plusDM = [];
  const minusDM = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - candles[i - 1].close),
      Math.abs(low - candles[i - 1].close)
    );
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    const plusDMI = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDMI = downMove > upMove && downMove > 0 ? downMove : 0;
    
    trueRanges.push(tr);
    plusDM.push(plusDMI);
    minusDM.push(minusDMI);
  }
  
  const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  const plusDI = (plusDM.slice(-period).reduce((a, b) => a + b, 0) / atr) * 100;
  const minusDI = (minusDM.slice(-period).reduce((a, b) => a + b, 0) / atr) * 100;
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  const adx = isNaN(dx) ? 25 : dx;
  
  let trend = 'RANGING';
  if (adx > 25) {
    trend = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
  }
  
  return { adx, plusDI, minusDI, trend };
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 */
function calculateVWAP(candles) {
  if (candles.length < 2) return candles[0]?.close || 0;
  
  let cumVolume = 0;
  let cumPriceVolume = 0;
  
  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumVolume += candle.volume;
    cumPriceVolume += typicalPrice * candle.volume;
  }
  
  return cumVolume > 0 ? cumPriceVolume / cumVolume : candles[0].close;
}

/**
 * Calculate Volume SMA
 */
function calculateVolumeSMA(candles, period = 20) {
  if (candles.length < period) {
    return candles.reduce((s, c) => s + c.volume, 0) / candles.length || 1;
  }
  
  const recentVolumes = candles.slice(-period).map(c => c.volume);
  return recentVolumes.reduce((s, v) => s + v, 0) / period;
}

// ============================================
// NEW INDICATORS v3
// ============================================

/**
 * Calculate CCI (Commodity Channel Index)
 */
function calculateCCI(candles, period = 20) {
  if (candles.length < period) return 0;
  
  const recentCandles = candles.slice(-period);
  const tp = recentCandles.map(c => (c.high + c.low + c.close) / 3);
  const smaTP = tp.reduce((s, t) => s + t, 0) / period;
  
  const currentPrice = candles[candles.length - 1];
  const typicalPrice = (currentPrice.high + currentPrice.low + currentPrice.close) / 3;
  
  const meanDeviation = tp.reduce((s, t) => s + Math.abs(t - smaTP), 0) / period;
  
  if (meanDeviation === 0) return 0;
  
  return (typicalPrice - smaTP) / (0.015 * meanDeviation);
}

/**
 * Calculate Williams %R
 */
function calculateWilliamsR(candles, period = 14) {
  if (candles.length < period) return -50;
  
  const recentPrices = candles.slice(-period);
  const highest = Math.max(...recentPrices.map(p => p.high));
  const lowest = Math.min(...recentPrices.map(p => p.low));
  const currentPrice = candles[candles.length - 1].close;
  
  if (highest === lowest) return -50;
  
  return ((highest - currentPrice) / (highest - lowest)) * -100;
}

/**
 * Calculate MFI (Money Flow Index)
 */
function calculateMFI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  
  const moneyFlow = [];
  for (let i = 1; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const rawMoneyFlow = typicalPrice * candles[i].volume;
    const prevTypicalPrice = (candles[i-1].high + candles[i-1].low + candles[i-1].close) / 3;
    
    if (typicalPrice > prevTypicalPrice) {
      moneyFlow.push({ type: 'positive', value: rawMoneyFlow });
    } else {
      moneyFlow.push({ type: 'negative', value: rawMoneyFlow });
    }
  }
  
  const recentFlow = moneyFlow.slice(-period);
  const positiveFlow = recentFlow.filter(f => f.type === 'positive').reduce((s, f) => s + f.value, 0);
  const negativeFlow = recentFlow.filter(f => f.type === 'negative').reduce((s, f) => s + f.value, 0);
  
  if (negativeFlow === 0) return 100;
  
  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - (100 / (1 + moneyRatio));
}

/**
 * Calculate ROC (Rate of Change)
 */
function calculateROC(prices, period = 12) {
  if (prices.length < period) return 0;
  
  const currentPrice = prices[prices.length - 1].close;
  const pastPrice = prices[prices.length - period].close;
  
  if (pastPrice === 0) return 0;
  
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

/**
 * Calculate OBV (On-Balance Volume)
 */
function calculateOBV(candles) {
  if (candles.length < 2) return candles[0]?.volume || 0;
  
  let obv = candles[0].volume;
  
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      obv += candles[i].volume;
    } else if (candles[i].close < candles[i - 1].close) {
      obv -= candles[i].volume;
    }
  }
  
  return obv;
}

/**
 * Calculate Ichimoku Cloud (Simplified)
 */
function calculateIchimoku(candles) {
  if (candles.length < 52) {
    return { tenkan: 0, kijun: 0, senkouA: 0, senkouB: 0, trend: 'RANGING' };
  }
  
  const high9 = Math.max(...candles.slice(-9).map(c => c.high));
  const low9 = Math.min(...candles.slice(-9).map(c => c.low));
  const tenkan = (high9 + low9) / 2;
  
  const high26 = Math.max(...candles.slice(-26).map(c => c.high));
  const low26 = Math.min(...candles.slice(-26).map(c => c.low));
  const kijun = (high26 + low26) / 2;
  
  const senkouA = (tenkan + kijun) / 2;
  
  const high52 = Math.max(...candles.slice(-52).map(c => c.high));
  const low52 = Math.min(...candles.slice(-52).map(c => c.low));
  const senkouB = (high52 + low52) / 2;
  
  const currentPrice = candles[candles.length - 1].close;
  
  let trend = 'RANGING';
  if (currentPrice > senkouA && currentPrice > senkouB) {
    trend = 'BULLISH';
  } else if (currentPrice < senkouA && currentPrice < senkouB) {
    trend = 'BEARISH';
  }
  
  return { tenkan, kijun, senkouA, senkouB, trend };
}

/**
 * Calculate Fibonacci Retracement Levels
 */
function calculateFibonacci(high, low) {
  const diff = high - low;
  return {
    level23: low + diff * 0.236,
    level38: low + diff * 0.382,
    level50: low + diff * 0.500,
    level61: low + diff * 0.618,
    level78: low + diff * 0.786
  };
}

/**
 * Detect Candlestick Patterns
 */
function detectPatterns(candles) {
  if (candles.length < 3) return [];
  
  const patterns = [];
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];
  
  // Doji
  if (Math.abs(current.close - current.open) < (current.high - current.low) * 0.1) {
    patterns.push({ name: 'DOJI', type: 'neutral' });
  }
  
  // Hammer
  const bodySize = Math.abs(current.close - current.open);
  const lowerShadow = Math.min(current.open, current.close) - current.low;
  const upperShadow = current.high - Math.max(current.open, current.close);
  
  if (lowerShadow > bodySize * 2 && upperShadow < bodySize * 0.5) {
    patterns.push({ name: 'HAMMER', type: 'bullish' });
  }
  
  // Shooting Star
  if (upperShadow > bodySize * 2 && lowerShadow < bodySize * 0.5) {
    patterns.push({ name: 'SHOOTING_STAR', type: 'bearish' });
  }
  
  // Engulfing Bullish
  if (prev.close < prev.open && current.close > current.open &&
      current.close > prev.open && current.open < prev.close) {
    patterns.push({ name: 'BULLISH_ENGULFING', type: 'bullish' });
  }
  
  // Engulfing Bearish
  if (prev.close > prev.open && current.close < current.open &&
      current.close < prev.open && current.open > prev.close) {
    patterns.push({ name: 'BEARISH_ENGULFING', type: 'bearish' });
  }
  
  // Morning Star (3-candle)
  if (candles.length >= 3) {
    const c1 = candles[candles.length - 3];
    const c2 = candles[candles.length - 2];
    
    if (c1.close < c1.open && // First: bearish
        Math.abs(c2.close - c2.open) < (c2.high - c2.low) * 0.3 && // Second: doji
        current.close > current.open && // Third: bullish
        current.close > (c1.open + c1.close) / 2) { // Breaks midpoint
      patterns.push({ name: 'MORNING_STAR', type: 'bullish' });
    }
  }
  
  return patterns;
}

// ============================================
// MAIN CALCULATION
// ============================================

/**
 * Calculate all indicators for a symbol
 */
function calculateAllIndicators(candles) {
  if (!candles || candles.length < 50) return null;
  
  const prices = candles.map(c => c.close);
  const closes = candles.map(c => ({ close: c.close, high: c.high, low: c.low, volume: c.volume }));
  
  const rsi = calculateRSI(candles);
  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const macd = calculateMACD(candles);
  const bb = calculateBollingerBands(candles);
  const stochastic = calculateStochastic(candles);
  const atr = calculateATR(candles);
  const adx = calculateADX(candles);
  const vwap = calculateVWAP(candles);
  const volumeSMA = calculateVolumeSMA(candles);
  
  // New indicators
  const cci = calculateCCI(candles);
  const williamsR = calculateWilliamsR(candles);
  const mfi = calculateMFI(candles);
  const roc = calculateROC(candles);
  const obv = calculateOBV(candles);
  const ichimoku = calculateIchimoku(candles);
  
  // Volume ratio
  const currentVolume = candles[candles.length - 1].volume;
  const volumeRatio = currentVolume / (volumeSMA || 1);
  
  // Trend detection
  let trend = 'RANGING';
  if (ema9 > ema21 && ema21 > ema50 && ema50 > ema200) {
    trend = 'BULLISH';
  } else if (ema9 < ema21 && ema21 < ema50 && ema50 < ema200) {
    trend = 'BEARISH';
  }
  
  return {
    // Core indicators
    rsi,
    ema9,
    ema21,
    ema50,
    ema200,
    macd,
    bb,
    bbPosition: bb.position,
    stochastic,
    atr,
    adx,
    vwap,
    volumeRatio,
    volume: currentVolume,
    volumeSMA,
    
    // New indicators
    cci,
    williamsR,
    mfi,
    roc,
    obv,
    ichimoku,
    
    // Derived
    trend,
    trend强度: Math.abs(ema9 - ema21) / (ema21 || 1) * 100,
    
    // Pattern detection
    patterns: detectPatterns(candles)
  };
}

module.exports = {
  CONFIG,
  calculateRSI,
  calculateEMA,
  calculateSMA,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateATR,
  calculateADX,
  calculateVWAP,
  calculateVolumeSMA,
  calculateCCI,
  calculateWilliamsR,
  calculateMFI,
  calculateROC,
  calculateOBV,
  calculateIchimoku,
  calculateFibonacci,
  detectPatterns,
  calculateAllIndicators
};
