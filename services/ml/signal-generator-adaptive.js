/**
 * Adaptive Signal Generator v6
 * Works in BOTH trending AND sideways markets
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const { 
  calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands,
  calculateStochastic, calculateATR, calculateADX, calculateVWAP, calculateVolumeSMA
} = require('./technical-indicators-v3');

const CONFIG = {
  // Trend settings
  trendMinADX: 25,
  trendMinConfidence: 55,
  
  // Sideways settings
  sidewaysMinConfidence: 50,
  sidewaysRSIBuy: 35,
  sidewaysRSISell: 65,
  sidewaysBBBuy: 0.2,
  sidewaysBBSell: 0.8
};

/**
 * Generate adaptive signal (works in any market)
 */
async function generateSignal(symbol, priceData, useAI = true) {
  const candles = priceData;
  
  if (!candles || candles.length < 50) {
    return { error: 'Insufficient data', symbol };
  }
  
  const current = candles[candles.length - 1];
  const currentPrice = current.close;
  
  // Calculate all indicators
  const indicators = calculateIndicators(candles);
  
  // Detect market type
  const marketType = detectMarketType(indicators);
  
  let signal;
  
  if (marketType === 'TRENDING') {
    signal = generateTrendSignal(indicators, currentPrice);
  } else if (marketType === 'SIDEWAYS') {
    signal = generateSidewaysSignal(indicators, currentPrice);
  } else {
    signal = generateChoppySignal(indicators, currentPrice);
  }
  
  return {
    ...signal,
    marketType,
    indicators: {
      rsi: indicators.rsi.toFixed(1),
      adx: typeof indicators.adx === 'object' ? indicators.adx.adx?.toFixed?.(1) || indicators.adx : indicators.adx?.toFixed?.(1) || 'N/A',
      volumeRatio: indicators.volumeRatio.toFixed(1),
      trend: indicators.trend
    }
  };
}

function calculateIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  const rsi = calculateRSI(candles);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const macd = calculateMACD(candles);
  const bb = calculateBollingerBands(candles);
  const stoch = calculateStochastic(candles);
  const atr = calculateATR(candles);
  const adx = calculateADX(candles);
  const vwap = calculateVWAP(candles);
  const volumeSMA = calculateVolumeSMA(candles);
  const volumeRatio = volumes[volumes.length - 1] / (volumeSMA || 1);
  
  // Trend detection
  let trend = 'NEUTRAL';
  if (ema9 > ema21 && ema21 > ema50) trend = 'BULLISH';
  else if (ema9 < ema21 && ema21 < ema50) trend = 'BEARISH';
  
  // Trend strength
  const trendStrength = Math.abs(ema9 - ema21) / ema21 * 100;
  
  return {
    rsi, ema9, ema21, ema50, macd, bb, stoch, atr, adx, vwap,
    volumeRatio, trend, trendStrength,
    closes, highs, lows, volumes, bbPosition: bb.position
  };
}

function detectMarketType(ind) {
  // Very low ADX = sideways
  if (ind.adx < 20 && ind.volumeRatio < 1.3) return 'SIDEWAYS';
  // Strong trend = trending
  if (ind.adx > 30 || ind.trendStrength > 1.5) return 'TRENDING';
  // Medium = choppy
  return 'CHOPPY';
}

function generateTrendSignal(ind, price) {
  let score = 0;
  const factors = [];
  
  // MACD
  if (ind.macd.histogram > 0) { score += 25; factors.push('MACD bullish'); }
  else { score -= 25; factors.push('MACD bearish'); }
  
  // EMA
  if (ind.ema9 > ind.ema21) { score += 20; factors.push('EMA bullish'); }
  else { score -= 20; factors.push('EMA bearish'); }
  
  // ADX
  const adxVal = typeof ind.adx === 'object' ? ind.adx.adx : ind.adx;
  if (adxVal > 25) { score += adxVal; factors.push(`Strong trend (ADX: ${adxVal.toFixed(0)})`); }
  
  // Volume
  if (ind.volumeRatio > 1.2) { score += (score > 0 ? 10 : -10); factors.push('Volume surge'); }
  
  // RSI
  if (ind.rsi < 30) { score += 15; factors.push('RSI oversold'); }
  else if (ind.rsi > 70) { score -= 15; factors.push('RSI overbought'); }
  
  let direction = 'HOLD';
  let confidence = Math.abs(score);
  
  if (score > 30 && ind.adx >= CONFIG.trendMinADX) {
    direction = 'LONG';
  } else if (score < -30 && ind.adx >= CONFIG.trendMinADX) {
    direction = 'SHORT';
  }
  
  if (confidence < CONFIG.trendMinConfidence) {
    direction = 'HOLD';
  }
  
  return buildSignal(direction, confidence, price, ind, factors);
}

function generateSidewaysSignal(ind, price) {
  let score = 0;
  const factors = [];
  
  // RSI mean reversion
  if (ind.rsi < CONFIG.sidewaysRSIBuy) {
    score += 35;
    factors.push(`RSI oversold: ${ind.rsi.toFixed(0)}`);
  } else if (ind.rsi > CONFIG.sidewaysRSISell) {
    score -= 35;
    factors.push(`RSI overbought: ${ind.rsi.toFixed(0)}`);
  }
  
  // BB mean reversion
  if (ind.bbPosition < CONFIG.sidewaysBBBuy) {
    score += 30;
    factors.push('At lower BB (support)');
  } else if (ind.bbPosition > CONFIG.sidewaysBBSell) {
    score -= 30;
    factors.push('At upper BB (resistance)');
  }
  
  // Stochastic
  if (ind.stoch.k < 20) {
    score += 20;
    factors.push(`Stochastic oversold: ${ind.stoch.k.toFixed(0)}`);
  } else if (ind.stoch.k > 80) {
    score -= 20;
    factors.push(`Stochastic overbought: ${ind.stoch.k.toFixed(0)}`);
  }
  
  // Volume spike confirmation
  if (ind.volumeRatio > 1.5) {
    score += 15;
    factors.push(`Volume spike: ${ind.volumeRatio.toFixed(1)}x`);
  }
  
  let direction = 'HOLD';
  let confidence = Math.abs(score);
  
  if (score > 25) direction = 'LONG';
  else if (score < -25) direction = 'SHORT';
  
  if (confidence < CONFIG.sidewaysMinConfidence) {
    direction = 'HOLD';
  }
  
  return buildSignal(direction, confidence, price, ind, factors);
}

function generateChoppySignal(ind, price) {
  // In choppy markets, be very conservative
  let score = 0;
  const factors = [];
  
  // Only trade on strong signals
  if (ind.rsi < 30 && ind.volumeRatio > 1.3) {
    score += 40;
    factors.push('RSI oversold + volume confirmation');
  } else if (ind.rsi > 70 && ind.volumeRatio > 1.3) {
    score -= 40;
    factors.push('RSI overbought + volume confirmation');
  }
  
  let direction = 'HOLD';
  let confidence = Math.abs(score);
  
  if (confidence < 60) direction = 'HOLD';
  else if (score > 0) direction = 'LONG';
  else direction = 'SHORT';
  
  return buildSignal(direction, confidence, price, ind, factors);
}

function buildSignal(direction, confidence, price, ind, factors) {
  let entry = price;
  let stopLoss, takeProfit;
  
  const atr = ind.atr;
  
  if (direction === 'LONG') {
    entry = price;
    stopLoss = entry * 0.99;    // 1% stop loss
    takeProfit = entry * 1.02;  // 2% take profit ✅
  } else if (direction === 'SHORT') {
    entry = price;
    stopLoss = entry * 1.01;    // 1% stop loss
    takeProfit = entry * 0.98;  // 2% take profit ✅
  } else {
    stopLoss = price * 0.99;
    takeProfit = price * 1.02;
  }
  
  return {
    direction,
    confidence: Math.round(confidence),
    entry,
    stopLoss,
    takeProfit,
    riskReward: direction !== 'HOLD' ? 
      Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss).toFixed(2) : '0',
    reasons: factors
  };
}

async function scanMarket(symbols) {
  const signals = [];
  
  for (const symbol of symbols) {
    try {
      const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
        params: { symbol, interval: '1h', limit: 100 }
      });
      
      const candles = data.map(k => ({
        close: parseFloat(k[4]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        volume: parseFloat(k[5])
      }));
      
      const signal = await generateSignal(symbol, candles, false);
      
      if (signal.direction !== 'HOLD') {
        signals.push({ symbol, ...signal });
      }
    } catch {}
  }
  
  return signals.sort((a, b) => b.confidence - a.confidence);
}

module.exports = { generateSignal, scanMarket };
