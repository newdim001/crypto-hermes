/**
 * Elite Signal Generator - Conservative High-Quality Trade Strategy
 * Only trades when EVERYTHING aligns perfectly
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const { calculateAllIndicators } = require('./technical-indicators-v3');

const CONFIG = {
  // Very strict thresholds
  minConfidence: 75, // Only high confidence
  minRSI: 25, // Only extreme RSI
  maxRSI: 75,
  minADX: 30, // Only strong trends
  requireVolume: true,
  minVolumeRatio: 1.5,
  
  // Market regime filters
  requireTrendConfirmation: true,
  trendLookback: 50,
  
  // Risk management
  maxRiskPerTrade: 1.5, // Max 1.5% risk
  minRiskReward: 2.5, // Min 2.5:1 R:R
  maxDailyTrades: 3,
  
  // Time filters
  noTradeBeforeHour: 3, // No trades before 3 AM (low volume)
  noTradeAfterHour: 20 // No trades after 8 PM
};

/**
 * Generate elite trading signal
 */
async function generateEliteSignal(symbol, priceData) {
  const candles = priceData;
  
  if (!candles || candles.length < 150) {
    return { error: 'Insufficient data', symbol };
  }
  
  const current = candles[candles.length - 1];
  const currentPrice = current.close;
  const currentHour = new Date().getHours();
  
  // Time filter
  if (currentHour < CONFIG.noTradeBeforeHour || currentHour > CONFIG.noTradeAfterHour) {
    return { error: 'Outside trading hours', symbol, filtered: 'time' };
  }
  
  // Calculate indicators
  const indicators = calculateAllIndicators(candles);
  
  if (!indicators) {
    return { error: 'Failed to calculate indicators', symbol };
  }
  
  // Check market regime (trend detection)
  const regime = detectMarketRegime(candles);
  
  if (CONFIG.requireTrendConfirmation && regime === 'NEUTRAL') {
    return { error: 'No clear trend', symbol, filtered: 'regime' };
  }
  
  // Score calculation
  let score = 0;
  let bullishFactors = 0;
  let bearishFactors = 0;
  const factors = [];
  
  // === RSI (MUST be extreme) ===
  if (indicators.rsi < CONFIG.minRSI) {
    score += 40;
    bullishFactors++;
    factors.push(`RSI oversold: ${indicators.rsi.toFixed(1)}`);
  } else if (indicators.rsi > CONFIG.maxRSI) {
    score -= 40;
    bearishFactors++;
    factors.push(`RSI overbought: ${indicators.rsi.toFixed(1)}`);
  } else {
    return { error: 'RSI not extreme enough', symbol, filtered: 'rsi', rsi: indicators.rsi };
  }
  
  // === ADX (Trend strength MUST be high) ===
  if (indicators.adx.adx >= CONFIG.minADX) {
    if (indicators.adx.trend === 'BULLISH') {
      score += 30;
      bullishFactors++;
      factors.push(`Strong bullish trend (ADX: ${indicators.adx.adx.toFixed(1)})`);
    } else if (indicators.adx.trend === 'BEARISH') {
      score -= 30;
      bearishFactors++;
      factors.push(`Strong bearish trend (ADX: ${indicators.adx.adx.toFixed(1)})`);
    }
  } else {
    return { error: 'ADX too weak for trend trading', symbol, filtered: 'adx', adx: indicators.adx.adx };
  }
  
  // === EMA Confirmation ===
  if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
    score += 20;
    bullishFactors++;
    factors.push('EMA bullish alignment');
  } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
    score -= 20;
    bearishFactors++;
    factors.push('EMA bearish alignment');
  } else {
    return { error: 'EMA not aligned', symbol, filtered: 'ema' };
  }
  
  // === Volume Confirmation ===
  if (CONFIG.requireVolume && indicators.volumeRatio < CONFIG.minVolumeRatio) {
    return { error: 'Volume not confirmed', symbol, filtered: 'volume', volumeRatio: indicators.volumeRatio };
  } else if (indicators.volumeRatio >= CONFIG.minVolumeRatio) {
    if (score > 0) {
      score += 15;
      factors.push(`High volume surge: ${indicators.volumeRatio.toFixed(1)}x`);
    } else {
      score -= 15;
      factors.push(`High volume drop: ${indicators.volumeRatio.toFixed(1)}x`);
    }
  }
  
  // === MACD Confirmation ===
  if (indicators.macd.histogram > 0 && indicators.macd.macdLine > 0) {
    score += 15;
    bullishFactors++;
    factors.push('MACD strongly bullish');
  } else if (indicators.macd.histogram < 0 && indicators.macd.macdLine < 0) {
    score -= 15;
    bearishFactors++;
    factors.push('MACD strongly bearish');
  }
  
  // === Stochastic Confirmation ===
  if (indicators.stochastic.k < 15) {
    score += 10;
    bullishFactors++;
    factors.push('Stochastic deeply oversold');
  } else if (indicators.stochastic.k > 85) {
    score -= 10;
    bearishFactors++;
    factors.push('Stochastic deeply overbought');
  }
  
  // === MFI Confirmation ===
  if (indicators.mfi < 20) {
    score += 10;
    bullishFactors++;
    factors.push('MFI extremely oversold');
  } else if (indicators.mfi > 80) {
    score -= 10;
    bearishFactors++;
    factors.push('MFI extremely overbought');
  }
  
  // === Market Regime Alignment ===
  if (regime === 'BULLISH' && score > 0) {
    score += 20;
    factors.push('Bullish regime alignment');
  } else if (regime === 'BEARISH' && score < 0) {
    score += 20;
    factors.push('Bearish regime alignment');
  } else if (regime === 'BULLISH' && score < 0) {
    return { error: 'Counter-trend trade', symbol, filtered: 'regime' };
  } else if (regime === 'BEARISH' && score > 0) {
    return { error: 'Counter-trend trade', symbol, filtered: 'regime' };
  }
  
  // === Bollinger Band Position ===
  if (indicators.bbPosition < 0.1) {
    score += 10;
    factors.push('At lower Bollinger Band');
  } else if (indicators.bbPosition > 0.9) {
    score -= 10;
    factors.push('At upper Bollinger Band');
  }
  
  // Determine direction
  let direction = 'HOLD';
  let confidence = 0;
  
  if (score > 100 && bullishFactors >= 4) {
    direction = 'LONG';
    confidence = Math.min(95, Math.min(score, 95));
  } else if (score < -100 && bearishFactors >= 4) {
    direction = 'SHORT';
    confidence = Math.min(95, Math.min(Math.abs(score), 95));
  }
  
  if (confidence < CONFIG.minConfidence) {
    return { error: 'Confidence below threshold', symbol, filtered: 'confidence', confidence };
  }
  
  // Calculate entry, stop, target
  const atr = indicators.atr;
  const atrPercent = atr / currentPrice;
  
  let entry = currentPrice;
  let stopLoss, takeProfit;
  
  if (direction === 'LONG') {
    // Entry slightly above current (wait for confirmation)
    entry = currentPrice * 1.001;
    // Stop below recent low or ATR
    stopLoss = currentPrice * (1 - atrPercent * 2.5);
    // Target 2.5:1 minimum
    const risk = entry - stopLoss;
    takeProfit = entry + risk * CONFIG.minRiskReward;
    
  } else if (direction === 'SHORT') {
    entry = currentPrice * 0.999;
    stopLoss = currentPrice * (1 + atrPercent * 2.5);
    const risk = stopLoss - entry;
    takeProfit = entry - risk * CONFIG.minRiskReward;
  }
  
  // Validate risk:reward
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  const riskReward = reward / risk;
  
  if (riskReward < CONFIG.minRiskReward) {
    return { error: 'Risk:Reward below minimum', symbol, filtered: 'rr', riskReward };
  }
  
  return {
    symbol,
    direction,
    confidence,
    entry: parseFloat(entry.toFixed(8)),
    stopLoss: parseFloat(stopLoss.toFixed(8)),
    takeProfit: parseFloat(takeProfit.toFixed(8)),
    riskReward: parseFloat(riskReward.toFixed(2)),
    riskPercent: parseFloat((risk / currentPrice * 100).toFixed(2)),
    factors,
    regime,
    indicators: {
      rsi: indicators.rsi.toFixed(1),
      adx: indicators.adx.adx.toFixed(1),
      volumeRatio: indicators.volumeRatio.toFixed(2),
      trend: regime
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Detect market regime
 */
function detectMarketRegime(candles) {
  if (candles.length < CONFIG.trendLookback) return 'NEUTRAL';
  
  const recent = candles.slice(-CONFIG.trendLookback);
  const prices = recent.map(c => c.close);
  
  // EMA-based trend
  const ema20 = prices.reduce((a, b) => a + b, 0) / prices.length;
  const ema50 = candles.slice(-50).map(c => c.close).reduce((a, b) => a + b, 0) / 50;
  
  const currentPrice = prices[prices.length - 1];
  
  // Trend strength
  const priceChange = (currentPrice - prices[0]) / prices[0];
  
  // Volatility
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
  }
  const avgVolatility = returns.reduce((a, b) => a + b, 0) / returns.length;
  
  if (currentPrice > ema20 && currentPrice > ema50 && priceChange > avgVolatility * 3) {
    return 'BULLISH';
  } else if (currentPrice < ema20 && currentPrice < ema50 && priceChange < -avgVolatility * 3) {
    return 'BEARISH';
  }
  
  return 'NEUTRAL';
}

/**
 * Scan market with elite signals
 */
async function scanMarketElite(symbols = null) {
  if (!symbols) {
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 
               'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'];
  }
  
  const signals = [];
  const filters = { time: 0, regime: 0, rsi: 0, adx: 0, ema: 0, volume: 0, confidence: 0, rr: 0 };
  
  for (const symbol of symbols) {
    try {
      const candles = await fetchPriceData(symbol, 200);
      
      if (candles && candles.length > 0) {
        const signal = await generateEliteSignal(symbol, candles);
        
        if (signal.error) {
          if (signal.filtered) filters[signal.filtered]++;
        } else {
          signals.push(signal);
        }
      }
    } catch (err) {
      console.log(`Error scanning ${symbol}:`, err.message);
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  return { signals, filters };
}

/**
 * Fetch price data
 */
async function fetchPriceData(symbol, limit = 200) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: { symbol, interval: '1h', limit },
      timeout: 10000
    });
    
    return response.data.map(candle => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6]
    }));
  } catch (err) {
    console.error(`Failed to fetch ${symbol}:`, err.message);
    return null;
  }
}

module.exports = {
  generateEliteSignal,
  scanMarketElite,
  CONFIG
};
