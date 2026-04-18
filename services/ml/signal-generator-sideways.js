/**
 * Sideways Market Signal Generator
 * Works in range-bound, choppy, low-volume markets
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const { 
  calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands,
  calculateStochastic, calculateATR, calculateVWAP, calculateVolumeSMA
} = require('./technical-indicators-v3');

const CONFIG = {
  // Range trading settings
  rangeRSIBuy: 35,      // Buy when RSI oversold
  rangeRSISell: 65,   // Sell when RSI overbought
  rangeBBBuy: 0.2,    // Buy at lower BB
  rangeBBSell: 0.8,   // Sell at upper BB
  rangeStochBuy: 20,   // Stochastic oversold
  rangeStochSell: 80,  // Stochastic overbought
  
  // Volume spike settings
  minVolumeSpike: 1.5, // 1.5x average volume
  
  // Confidence thresholds
  minConfidence: 50,
  
  // Support/Resistance lookback
  srLookback: 50
};

/**
 * Generate sideways/range signal
 */
async function generateSidewaysSignal(symbol, priceData) {
  if (!priceData || priceData.length < CONFIG.srLookback) {
    return { error: 'Insufficient data' };
  }
  
  const candles = priceData;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Calculate indicators
  const rsi = calculateRSI(candles);
  const stoch = calculateStochastic(candles);
  const bb = calculateBollingerBands(candles);
  const atr = calculateATR(candles);
  const volumeSMA = calculateVolumeSMA(candles);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / (volumeSMA || 1);
  
  // Calculate support/resistance
  const { support, resistance } = findSupportResistance(closes, highs, lows);
  
  // Calculate VWAP
  const vwap = calculateVWAP(candles);
  const currentPrice = closes[closes.length - 1];
  
  // Score the signals
  let score = 0;
  const factors = [];
  
  // RSI signals (contrarian)
  if (rsi < CONFIG.rangeRSIBuy) {
    score += 30;
    factors.push(`RSI oversold: ${rsi.toFixed(1)}`);
  } else if (rsi > CONFIG.rangeRSISell) {
    score -= 30;
    factors.push(`RSI overbought: ${rsi.toFixed(1)}`);
  }
  
  // Stochastic signals
  if (stoch.k < CONFIG.rangeStochBuy) {
    score += 20;
    factors.push(`Stochastic oversold: ${stoch.k.toFixed(1)}`);
  } else if (stoch.k > CONFIG.rangeStochSell) {
    score -= 20;
    factors.push(`Stochastic overbought: ${stoch.k.toFixed(1)}`);
  }
  
  // Bollinger Band signals
  if (bb.position < CONFIG.rangeBBBuy) {
    score += 25;
    factors.push('At lower BB (support)');
  } else if (bb.position > CONFIG.rangeBBSell) {
    score -= 25;
    factors.push('At upper BB (resistance)');
  }
  
  // Volume confirmation
  if (volumeRatio >= CONFIG.minVolumeSpike) {
    score += (score > 0 ? 15 : -15);
    factors.push(`Volume spike: ${volumeRatio.toFixed(1)}x`);
  }
  
  // VWAP proximity
  const vwapDistance = Math.abs(currentPrice - vwap) / currentPrice * 100;
  if (vwapDistance < 0.5) {
    score += 10;
    factors.push('Near VWAP');
  }
  
  // Near support/resistance
  if (currentPrice <= support * 1.02) {
    score += 20;
    factors.push('Near support zone');
  } else if (currentPrice >= resistance * 0.98) {
    score -= 20;
    factors.push('Near resistance zone');
  }
  
  // Determine direction
  let direction = 'HOLD';
  let confidence = Math.abs(score);
  
  if (score > 30 && rsi < 45) {
    direction = 'LONG';
  } else if (score < -30 && rsi > 55) {
    direction = 'SHORT';
  }
  
  if (confidence < CONFIG.minConfidence) {
    direction = 'HOLD';
  }
  
  // Calculate entry, stop, target
  let entry = currentPrice;
  let stopLoss, takeProfit;
  
  if (direction === 'LONG') {
    entry = currentPrice * 1.001; // Slight premium
    stopLoss = support * 0.99;
    takeProfit = resistance * 0.999;
  } else if (direction === 'SHORT') {
    entry = currentPrice * 0.999;
    stopLoss = resistance * 1.01;
    takeProfit = support * 1.001;
  }
  
  const riskReward = direction !== 'HOLD' ? 
    Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss) : 0;
  
  return {
    symbol,
    direction,
    confidence: Math.round(confidence),
    entry,
    stopLoss,
    takeProfit,
    riskReward: riskReward.toFixed(2),
    marketType: 'SIDEWAYS',
    factors,
    indicators: {
      rsi: rsi.toFixed(1),
      stochastic: stoch.k.toFixed(1),
      bbPosition: (bb.position * 100).toFixed(0) + '%',
      volumeRatio: volumeRatio.toFixed(1) + 'x',
      support: support.toFixed(2),
      resistance: resistance.toFixed(2),
      vwap: vwap.toFixed(2)
    }
  };
}

/**
 * Find support and resistance levels
 */
function findSupportResistance(closes, highs, lows) {
  const lookback = CONFIG.srLookback;
  const recent = closes.slice(-lookback);
  const highPrices = highs.slice(-lookback);
  const lowPrices = lows.slice(-lookback);
  
  // Find swing highs (resistance)
  const swingHighs = [];
  for (let i = 2; i < highPrices.length - 2; i++) {
    if (highPrices[i] > highPrices[i-1] && highPrices[i] > highPrices[i+1]) {
      swingHighs.push(highPrices[i]);
    }
  }
  
  // Find swing lows (support)
  const swingLows = [];
  for (let i = 2; i < lowPrices.length - 2; i++) {
    if (lowPrices[i] < lowPrices[i-1] && lowPrices[i] < lowPrices[i+1]) {
      swingLows.push(lowPrices[i]);
    }
  }
  
  // Cluster highs to find resistance
  const resistance = swingHighs.length > 0 ? 
    swingHighs.sort((a, b) => b - a)[0] : Math.max(...highPrices);
  
  // Cluster lows to find support
  const support = swingLows.length > 0 ?
    swingLows.sort((a, b) => a - b)[0] : Math.min(...lowPrices);
  
  return { support, resistance };
}

/**
 * Detect market type
 */
function detectMarketType(candles) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Calculate ADX-like trend strength
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const trendStrength = Math.abs(ema9 - ema21) / ema21 * 100;
  
  // Volume analysis
  const volumeRatio = volumes[volumes.length - 1] / calculateVolumeSMA(candles);
  
  // RSI position
  const rsi = calculateRSI(candles);
  
  // Determine market type
  if (trendStrength < 0.5 && volumeRatio < 1.2) {
    return 'SIDEWAYS';
  } else if (trendStrength > 1.5) {
    return 'TRENDING';
  } else {
    return 'CHOPPY';
  }
}

module.exports = {
  generateSidewaysSignal,
  detectMarketType
};
