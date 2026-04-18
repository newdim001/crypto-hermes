/**
 * ML Trading v2 Technical Indicators
 * Ported from kvantedge/trading-bot/services/ml-trading-v2.js
 * Combined with CryptoBot's architecture
 */

const CONFIG = {
  // Indicator weights for signal generation
  WEIGHTS: {
    rsi: 15,
    macd: 20,
    ema: 15,
    bb: 15,
    stochastic: 10,
    adx: 10,
    volume: 10,
    pattern: 5
  },
  // Trading parameters
  minConfidence: 55,
  maxPositions: 3,
  riskPerTrade: 2
};

// ============================================
// ADVANCED TECHNICAL INDICATORS
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
  const macdLine = (ema12 || 0) - (ema26 || 0);
  
  // Calculate signal line (9-period EMA of MACD)
  const macdValues = [];
  for (let i = 0; i < prices.length; i++) {
    const slice = prices.slice(0, i + 1);
    if (slice.length >= 26) {
      const e12 = calculateEMA(slice, 12);
      const e26 = calculateEMA(slice, 26);
      if (e12 > 0 && e26 > 0) {
        macdValues.push(e12 - e26);
      }
    }
  }
  
  if (macdValues.length < 9) {
    return { macdLine, signalLine: 0, histogram: macdLine };
  }
  
  const signalLine = calculateEMA(macdValues, 9);
  const histogram = macdLine - (signalLine || 0);
  
  return { 
    macdLine: isNaN(macdLine) ? 0 : macdLine, 
    signalLine: isNaN(signalLine) ? 0 : signalLine, 
    histogram: isNaN(histogram) ? 0 : histogram 
  };
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0, width: 0 };
  
  const sma = calculateSMA(prices, period);
  const slice = prices.slice(-period);
  const variance = slice.reduce((s, p) => s + Math.pow(p.close - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  return {
    upper: sma + (stdDev * std),
    middle: sma,
    lower: sma - (stdDev * std),
    width: (stdDev * std) / sma * 100
  };
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(prices, period = 14) {
  if (prices.length < period) return { k: 50, d: 50 };
  
  const slice = prices.slice(-period);
  const highest = Math.max(...slice.map(p => p.high));
  const lowest = Math.min(...slice.map(p => p.low));
  const current = prices[prices.length - 1].close;
  
  const k = highest === lowest ? 50 : ((current - lowest) / (highest - lowest)) * 100;
  const d = k;
  
  return { k, d };
}

/**
 * Calculate ATR (Average True Range)
 */
function calculateATR(prices, period = 14) {
  if (prices.length < period + 1) return 0;
  
  let atr = 0;
  for (let i = 1; i < prices.length; i++) {
    const tr = Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prices[i-1].close),
      Math.abs(prices[i].low - prices[i-1].close)
    );
    atr += tr;
  }
  return atr / prices.length;
}

/**
 * Calculate ADX (Average Directional Index)
 */
function calculateADX(prices, period = 14) {
  if (prices.length < period * 2) return { adx: 25, plusDI: 25, minusDI: 25 };
  
  let plusDM = 0, minusDM = 0, tr = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const highDiff = prices[i].high - prices[i-1].high;
    const lowDiff = prices[i-1].low - prices[i].low;
    
    plusDM += highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
    minusDM += lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
    
    tr += Math.max(
      prices[i].high - prices[i].low,
      Math.abs(prices[i].high - prices[i-1].close),
      Math.abs(prices[i].low - prices[i-1].close)
    );
  }
  
  const atr = tr / period;
  const plusDI = atr > 0 ? (plusDM / atr) * 100 : 0;
  const minusDI = atr > 0 ? (minusDM / atr) * 100 : 0;
  const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
  const adx = dx;
  
  return { adx, plusDI, minusDI };
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 */
function calculateVWAP(prices) {
  if (prices.length === 0) return 0;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const p of prices) {
    const typicalPrice = (p.high + p.low + p.close) / 3;
    cumulativeTPV += typicalPrice * p.volume;
    cumulativeVolume += p.volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

/**
 * Calculate Volume SMA
 */
function calculateVolumeSMA(prices, period = 20) {
  if (prices.length < period) return 0;
  const sum = prices.slice(-period).reduce((s, p) => s + p.volume, 0);
  return sum / period;
}

/**
 * Detect candlestick patterns
 */
function detectPatterns(prices) {
  if (prices.length < 3) return [];
  
  const patterns = [];
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  const prev2 = prices[prices.length - 3];
  
  const body = last.close - last.open;
  const bodySize = Math.abs(body);
  const range = last.high - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;
  
  // Doji
  if (range > 0 && bodySize < range * 0.1) {
    patterns.push({ name: 'doji', strength: 0.5 });
  }
  
  // Hammer / Shooting Star
  if (lowerWick > bodySize * 2 && upperWick < bodySize) {
    if (last.close > last.open) {
      patterns.push({ name: 'hammer', strength: 0.7 });
    } else {
      patterns.push({ name: 'shooting_star', strength: -0.7 });
    }
  }
  
  // Bullish Engulfing
  if (prev2.close < prev2.open && last.close > last.open && 
      last.close > prev.open && last.open < prev.close) {
    patterns.push({ name: 'bullish_engulfing', strength: 0.8 });
  }
  
  // Bearish Engulfing
  if (prev2.close > prev2.open && last.close < last.open && 
      last.close < prev.open && last.open > prev.close) {
    patterns.push({ name: 'bearish_engulfing', strength: -0.8 });
  }
  
  // Three white soldiers
  if (prices.length >= 3) {
    const last3 = prices.slice(-3);
    const allGreen = last3.every(p => p.close > p.open);
    const consecutive = last3.every((p, i) => i === 0 || p.close > last3[i-1].close);
    if (allGreen && consecutive) {
      patterns.push({ name: 'three_white_soldiers', strength: 0.9 });
    }
    const allRed = last3.every(p => p.close < p.open);
    const consecutiveDown = last3.every((p, i) => i === 0 || p.close < last3[i-1].close);
    if (allRed && consecutiveDown) {
      patterns.push({ name: 'three_black_crows', strength: -0.9 });
    }
  }
  
  return patterns;
}

// ============================================
// COMPREHENSIVE INDICATORS CALCULATION
// ============================================

/**
 * Calculate all indicators at once
 */
function calculateAllIndicators(candles) {
  if (!candles || candles.length < 50) {
    return null;
  }
  
  const current = candles[candles.length - 1];
  
  const indicators = {
    rsi: calculateRSI(candles),
    ema9: calculateEMA(candles, 9),
    ema21: calculateEMA(candles, 21),
    ema50: calculateEMA(candles, 50),
    sma20: calculateSMA(candles, 20),
    macd: calculateMACD(candles),
    bb: calculateBollingerBands(candles),
    stochastic: calculateStochastic(candles),
    atr: calculateATR(candles),
    adx: calculateADX(candles),
    vwap: calculateVWAP(candles),
    volume: current.volume,
    volumeSMA: calculateVolumeSMA(candles),
    price: current.close,
    high: current.high,
    low: current.low,
    open: current.open
  };
  
  // Calculate trends
  indicators.trend = indicators.ema9 > indicators.ema21 ? 'bullish' : 'bearish';
  
  // Volume analysis
  indicators.volumeRatio = current.volume / indicators.volumeSMA;
  indicators.volumeTrend = indicators.volumeRatio > 1 ? 'high' : 'low';
  
  // Bollinger Band position
  indicators.bbPosition = (current.close - indicators.bb.lower) / 
    (indicators.bb.upper - indicators.bb.lower || 1);
  
  return indicators;
}

/**
 * Calculate multi-timeframe analysis
 */
function calculateMultiTimeframe(candles1h, candles4h = null) {
  const h1Indicators = calculateAllIndicators(candles1h);
  
  if (!candles4h || candles4h.length < 50) {
    return {
      h1: h1Indicators,
      h4: null,
      alignment: h1Indicators?.trend || 'neutral'
    };
  }
  
  const h4Indicators = calculateAllIndicators(candles4h);
  const alignment = h1Indicators?.trend === h4Indicators?.trend ? 
    'aligned' : 'divergent';
  
  return {
    h1: h1Indicators,
    h4: h4Indicators,
    alignment
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
  detectPatterns,
  calculateAllIndicators,
  calculateMultiTimeframe
};
