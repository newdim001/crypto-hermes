/**
 * Final Improved Signal Generator v5
 * Conservative but not too strict - waits for clear setups
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const { calculateAllIndicators } = require('./technical-indicators-v3');

const CONFIG = {
  // Trading hours (UTC)
  minHour: 6,  // 6 AM UTC = 10 AM Dubai
  maxHour: 22, // 10 PM UTC = 2 AM Dubai
  
  // Signal requirements
  minConfidence: 65,
  minRSI: 28,  // Slightly relaxed
  maxRSI: 72,
  minADX: 25,
  
  // Filters
  requireVolume: true,
  minVolumeRatio: 1.3,
  
  // Position management
  maxRiskPercent: 1.5,
  minRiskReward: 2.0,
  maxDailyTrades: 5
};

/**
 * Generate improved trading signal
 */
async function generateSignalV5(symbol, priceData) {
  const candles = priceData;
  
  if (!candles || candles.length < 100) {
    return { error: 'Insufficient data', symbol };
  }
  
  const current = candles[candles.length - 1];
  const currentPrice = current.close;
  const currentHour = new Date().getHours();
  
  // Time filter
  if (currentHour < CONFIG.minHour || currentHour > CONFIG.maxHour) {
    return { error: 'Outside trading hours', symbol, filtered: 'time' };
  }
  
  // Calculate indicators
  const indicators = calculateAllIndicators(candles);
  
  if (!indicators) {
    return { error: 'Failed to calculate indicators', symbol };
  }
  
  // Detect regime
  const regime = detectMarketRegime(candles);
  
  // Scoring
  let score = 0;
  const factors = [];
  
  // RSI (with wider range)
  if (indicators.rsi < CONFIG.minRSI) {
    score += 35;
    factors.push('RSI oversold');
  } else if (indicators.rsi > CONFIG.maxRSI) {
    score -= 35;
    factors.push('RSI overbought');
  } else {
    return { error: 'RSI not in extreme zone', symbol, filtered: 'rsi', rsi: indicators.rsi.toFixed(1) };
  }
  
  // ADX (trend strength)
  if (indicators.adx.adx < CONFIG.minADX) {
    return { error: 'ADX too weak', symbol, filtered: 'adx', adx: indicators.adx.adx.toFixed(1) };
  }
  
  if (indicators.adx.trend === 'BULLISH') {
    score += 25;
    factors.push('Strong bullish trend');
  } else if (indicators.adx.trend === 'BEARISH') {
    score -= 25;
    factors.push('Strong bearish trend');
  } else {
    return { error: 'No clear trend direction', symbol, filtered: 'adx' };
  }
  
  // EMA alignment
  if (indicators.ema9 > indicators.ema21) {
    score += 15;
    factors.push('EMA bullish');
  } else {
    score -= 15;
    factors.push('EMA bearish');
  }
  
  // MACD confirmation
  if (indicators.macd.histogram > 0) {
    score += 10;
    factors.push('MACD bullish');
  } else {
    score -= 10;
    factors.push('MACD bearish');
  }
  
  // Volume
  if (indicators.volumeRatio >= CONFIG.minVolumeRatio) {
    score += (indicators.volumeRatio > 2 ? 15 : 10);
    factors.push('Volume confirmed');
  } else {
    return { error: 'Volume not confirmed', symbol, filtered: 'volume', volumeRatio: indicators.volumeRatio.toFixed(2) };
  }
  
  // Stochastic confirmation
  if (indicators.stochastic.k < 20) {
    score += 10;
    factors.push('Stochastic oversold');
  } else if (indicators.stochastic.k > 80) {
    score -= 10;
    factors.push('Stochastic overbought');
  }
  
  // Regime alignment
  if (regime === 'BULLISH' && score > 0) {
    score += 15;
    factors.push('Bull regime');
  } else if (regime === 'BEARISH' && score < 0) {
    score += 15;
    factors.push('Bear regime');
  } else if (regime === 'BULLISH' && score < 0) {
    return { error: 'Counter-trend LONG', symbol, filtered: 'regime' };
  } else if (regime === 'BEARISH' && score > 0) {
    return { error: 'Counter-trend SHORT', symbol, filtered: 'regime' };
  }
  
  // BB confirmation
  if (indicators.bbPosition < 0.15) {
    score += 10;
    factors.push('At lower BB');
  } else if (indicators.bbPosition > 0.85) {
    score -= 10;
    factors.push('At upper BB');
  }
  
  // Determine direction
  let direction = 'HOLD';
  let confidence = 0;
  
  if (score > 60 && indicators.adx.adx >= CONFIG.minADX) {
    direction = 'LONG';
    confidence = Math.min(90, Math.abs(score) + 20);
  } else if (score < -60 && indicators.adx.adx >= CONFIG.minADX) {
    direction = 'SHORT';
    confidence = Math.min(90, Math.abs(score) + 20);
  }
  
  if (confidence < CONFIG.minConfidence) {
    return { error: 'Confidence too low', symbol, filtered: 'confidence', confidence };
  }
  
  // Calculate entry, stop, target
  const atr = indicators.atr;
  const atrPercent = atr / currentPrice;
  
  let entry, stopLoss, takeProfit;
  
  if (direction === 'LONG') {
    entry = currentPrice;
    stopLoss = currentPrice * (1 - atrPercent * 2);
    const risk = entry - stopLoss;
    takeProfit = entry + risk * CONFIG.minRiskReward;
  } else {
    entry = currentPrice;
    stopLoss = currentPrice * (1 + atrPercent * 2);
    const risk = stopLoss - entry;
    takeProfit = entry - risk * CONFIG.minRiskReward;
  }
  
  const riskReward = Math.abs(takeProfit - entry) / Math.abs(entry - stopLoss);
  
  if (riskReward < CONFIG.minRiskReward) {
    return { error: 'Risk:Reward insufficient', symbol, filtered: 'rr', riskReward };
  }
  
  return {
    symbol,
    direction,
    confidence: Math.round(confidence),
    entry: parseFloat(entry.toFixed(8)),
    stopLoss: parseFloat(stopLoss.toFixed(8)),
    takeProfit: parseFloat(takeProfit.toFixed(8)),
    riskReward: parseFloat(riskReward.toFixed(2)),
    riskPercent: parseFloat((Math.abs(entry - stopLoss) / currentPrice * 100).toFixed(2)),
    factors,
    regime,
    indicators: {
      rsi: indicators.rsi.toFixed(1),
      adx: indicators.adx.adx.toFixed(1),
      volumeRatio: indicators.volumeRatio.toFixed(2),
      trend: indicators.adx.trend
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Detect market regime
 */
function detectMarketRegime(candles) {
  if (candles.length < 50) return 'NEUTRAL';
  
  const recent = candles.slice(-50);
  const prices = recent.map(c => c.close);
  const ema = prices.reduce((a, b) => a + b, 0) / prices.length;
  const currentPrice = prices[prices.length - 1];
  
  const change = (currentPrice - prices[0]) / prices[0];
  
  if (currentPrice > ema && change > 0.01) return 'BULLISH';
  if (currentPrice < ema && change < -0.01) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * Scan market
 */
async function scanMarketV5(symbols = null) {
  if (!symbols) {
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 
               'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'];
  }
  
  const signals = [];
  const filters = { time: 0, rsi: 0, adx: 0, volume: 0, regime: 0, confidence: 0, rr: 0 };
  
  for (const symbol of symbols) {
    try {
      const candles = await fetchPriceData(symbol, 200);
      
      if (candles && candles.length > 0) {
        const signal = await generateSignalV5(symbol, candles);
        
        if (signal.error && signal.filtered) {
          filters[signal.filtered]++;
        } else if (!signal.error) {
          signals.push(signal);
        }
      }
    } catch (err) {
      console.log(`Error: ${symbol}`, err.message);
    }
  }
  
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
    return null;
  }
}

module.exports = {
  generateSignalV5,
  scanMarketV5,
  CONFIG
};
