/**
 * Enhanced Signal Generator v4 - Complete Trading Strategy
 * Combines: Technical Analysis + Sentiment + Order Flow (Whales)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const { 
  calculateAllIndicators,
  calculateRSI,
  calculateEMA,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateATR,
  calculateADX
} = require('./technical-indicators-v3');

const { adjustForSentiment, getMarketSentiment } = require('../analytics/sentiment-analyzer');
const { getWhaleSignal } = require('../market/order-flow');
const { findSupportResistance, getOptimalEntry, calculateSRLoss } = require('../market/support-resistance');

// Configuration
const CONFIG = {
  // Technical thresholds
  minConfidence: 55,
  minTechScore: 30,
  
  // Sentiment thresholds
  minSentiment: 40,
  maxSentiment: 60,
  sentimentBoost: 15,
  
  // Order flow thresholds
  requireWhaleConfirm: true,
  minWhaleConfidence: 50,
  
  // S/R requirements
  useSupportResistance: true,
  sROptimalEntry: true,
  
  // Multi-timeframe
  confirmMultiTimeframe: true,
  
  // Risk management
  maxDailyTrades: 10,
  maxRiskPerTrade: 2
};

/**
 * Generate comprehensive trading signal v4
 */
async function generateSignalV4(symbol, priceData) {
  const candles = priceData;
  
  if (!candles || candles.length < 100) {
    return { error: 'Insufficient data', symbol };
  }
  
  const current = candles[candles.length - 1];
  const currentPrice = current.close;
  
  // 1. Calculate technical indicators
  const tech = calculateTechnicalAnalysis(candles);
  
  // 2. Check support/resistance
  const sr = findSupportResistance(candles);
  const srCheck = getOptimalEntry(tech.direction, currentPrice, sr.supports, sr.resistances);
  
  // 3. Get sentiment
  const sentiment = await adjustForSentiment(symbol, tech.confidence, tech.direction);
  
  // 4. Get order flow (whales)
  const whales = await getWhaleSignal(symbol);
  
  // 5. Get market-wide sentiment
  const marketSentiment = await getMarketSentiment();
  
  // 6. Calculate combined score
  const { direction, confidence, breakdown } = calculateCombinedScore(
    tech, sentiment, whales, sr, marketSentiment, srCheck
  );
  
  // 7. Calculate entry, stop, target with S/R
  const { entry, stopLoss, takeProfit } = calculateEntryStopTarget(
    direction, currentPrice, tech, sr, whales
  );
  
  // 8. Generate reasons
  const reasons = generateReasons(tech, sentiment, whales, srCheck, marketSentiment);
  
  return {
    symbol,
    direction,
    confidence,
    entry,
    stopLoss,
    takeProfit,
    riskReward: calculateRiskReward(currentPrice, stopLoss, takeProfit),
    reasons,
    indicators: {
      technical: tech,
      sentiment: {
        score: sentiment.sentiment,
        adjustment: sentiment.adjustment,
        reason: sentiment.reason
      },
      whales: {
        signal: whales.signal,
        confidence: whales.confidence,
        buyRatio: whales.buyRatio,
        whaleCount: whales.whaleCount
      },
      support: srCheck,
      market: marketSentiment
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate technical analysis score
 */
function calculateTechnicalAnalysis(candles) {
  const indicators = calculateAllIndicators(candles);
  
  if (!indicators) {
    return { score: 0, direction: 'HOLD', confidence: 0 };
  }
  
  let score = 0;
  let bullishSignals = 0;
  let bearishSignals = 0;
  
  // RSI (0-100)
  if (indicators.rsi < 30) {
    score += 25;
    bullishSignals += 2;
  } else if (indicators.rsi > 70) {
    score -= 25;
    bearishSignals += 2;
  } else if (indicators.rsi < 45) {
    score += 10;
    bullishSignals += 1;
  } else if (indicators.rsi > 55) {
    score -= 10;
    bearishSignals += 1;
  }
  
  // MACD
  if (indicators.macd.histogram > 0 && indicators.macd.macdLine > 0) {
    score += 20;
    bullishSignals += 2;
  } else if (indicators.macd.histogram < 0 && indicators.macd.macdLine < 0) {
    score -= 20;
    bearishSignals += 2;
  } else if (indicators.macd.histogram > 0) {
    score += 10;
    bullishSignals += 1;
  } else {
    score -= 10;
    bearishSignals += 1;
  }
  
  // EMA Crossover
  if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
    score += 25;
    bullishSignals += 2;
  } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
    score -= 25;
    bearishSignals += 2;
  } else if (indicators.ema9 > indicators.ema21) {
    score += 15;
    bullishSignals += 1;
  } else {
    score -= 15;
    bearishSignals += 1;
  }
  
  // Bollinger Bands
  if (indicators.bbPosition < 0.2) {
    score += 15;
    bullishSignals += 1;
  } else if (indicators.bbPosition > 0.8) {
    score -= 15;
    bearishSignals += 1;
  }
  
  // Stochastic
  if (indicators.stochastic.k < 20) {
    score += 15;
    bullishSignals += 1;
  } else if (indicators.stochastic.k > 80) {
    score -= 15;
    bearishSignals += 1;
  }
  
  // ADX Trend Strength
  if (indicators.adx.trend === 'BULLISH') {
    score += indicators.adx.adx / 3;
    bullishSignals += 1;
  } else if (indicators.adx.trend === 'BEARISH') {
    score -= indicators.adx.adx / 3;
    bearishSignals += 1;
  }
  
  // New indicators
  if (indicators.cci < -100) {
    score += 15;
    bullishSignals += 1;
  } else if (indicators.cci > 100) {
    score -= 15;
    bearishSignals += 1;
  }
  
  if (indicators.williamsR < -80) {
    score += 15;
    bullishSignals += 1;
  } else if (indicators.williamsR > -20) {
    score -= 15;
    bearishSignals += 1;
  }
  
  if (indicators.mfi < 20) {
    score += 15;
    bullishSignals += 1;
  } else if (indicators.mfi > 80) {
    score -= 15;
    bearishSignals += 1;
  }
  
  // Volume confirmation
  if (indicators.volumeRatio > 1.5) {
    if (score > 0) score += 10;
    else score -= 10;
  }
  
  // Determine direction
  let direction = 'HOLD';
  let confidence = 0;
  
  if (score > CONFIG.minTechScore && bullishSignals >= 3) {
    direction = 'LONG';
    confidence = Math.min(90, Math.abs(score) + bullishSignals * 5);
  } else if (score < -CONFIG.minTechScore && bearishSignals >= 3) {
    direction = 'SHORT';
    confidence = Math.min(90, Math.abs(score) + bearishSignals * 5);
  } else if (score > CONFIG.minTechScore / 2) {
    direction = 'LONG';
    confidence = Math.min(60, Math.abs(score) / 2);
  } else if (score < -CONFIG.minTechScore / 2) {
    direction = 'SHORT';
    confidence = Math.min(60, Math.abs(score) / 2);
  }
  
  return {
    score,
    direction,
    confidence: Math.round(confidence),
    indicators,
    bullishSignals,
    bearishSignals
  };
}

/**
 * Calculate combined score from all factors
 */
function calculateCombinedScore(tech, sentiment, whales, sr, marketSentiment, srCheck) {
  let combinedScore = 0;
  let finalDirection = 'HOLD';
  let finalConfidence = 0;
  
  const breakdown = {
    technical: { score: tech.score, weight: 40, contribution: 0 },
    sentiment: { score: sentiment.adjustment * 5, weight: 25, contribution: 0 },
    whales: { score: 0, weight: 20, contribution: 0 },
    support: { score: 0, weight: 10, contribution: 0 },
    market: { score: 0, weight: 5, contribution: 0 }
  };
  
  // Technical contribution (40% weight)
  breakdown.technical.contribution = (tech.score / 100) * breakdown.technical.weight;
  combinedScore += breakdown.technical.contribution;
  
  // Sentiment contribution (25% weight)
  breakdown.sentiment.contribution = (sentiment.adjustment / 100) * breakdown.sentiment.weight;
  combinedScore += breakdown.sentiment.contribution;
  
  // Whale/Order flow contribution (20% weight)
  if (whales.signal === 'STRONG_BUY') {
    breakdown.whales.score = 100;
    breakdown.whales.contribution = breakdown.whales.weight;
    combinedScore += breakdown.whales.weight;
  } else if (whales.signal === 'BUY') {
    breakdown.whales.score = 60;
    breakdown.whales.contribution = breakdown.whales.weight * 0.6;
    combinedScore += breakdown.whales.weight * 0.6;
  } else if (whales.signal === 'SELL') {
    breakdown.whales.score = -60;
    breakdown.whales.contribution = -breakdown.whales.weight * 0.6;
    combinedScore -= breakdown.whales.weight * 0.6;
  } else if (whales.signal === 'STRONG_SELL') {
    breakdown.whales.score = -100;
    breakdown.whales.contribution = -breakdown.whales.weight;
    combinedScore -= breakdown.whales.weight;
  }
  
  // Support/Resistance contribution (10% weight)
  if (srCheck.recommended) {
    const srScore = srCheck.level > 0 ? 50 : -50;
    breakdown.support.score = srScore;
    breakdown.support.contribution = srScore / 10;
    combinedScore += breakdown.support.contribution;
  }
  
  // Market sentiment contribution (5% weight)
  if (marketSentiment.average > 60) {
    breakdown.market.score = 50;
    breakdown.market.contribution = breakdown.market.weight * 0.5;
  } else if (marketSentiment.average < 40) {
    breakdown.market.score = -50;
    breakdown.market.contribution = -breakdown.market.weight * 0.5;
  }
  combinedScore += breakdown.market.contribution;
  
  // Determine final direction and confidence
  if (combinedScore > 15) {
    finalDirection = 'LONG';
    finalConfidence = Math.min(95, Math.abs(combinedScore) * 1.5 + 20);
  } else if (combinedScore < -15) {
    finalDirection = 'SHORT';
    finalConfidence = Math.min(95, Math.abs(combinedScore) * 1.5 + 20);
  }
  
  return {
    direction: finalDirection,
    confidence: Math.round(finalConfidence),
    breakdown
  };
}

/**
 * Calculate entry, stop loss, take profit
 */
function calculateEntryStopTarget(direction, currentPrice, tech, sr, whales) {
  const atr = tech.indicators?.atr || currentPrice * 0.02;
  const atrPercent = atr / currentPrice;
  
  let entry = currentPrice;
  let stopLoss, takeProfit;
  
  // Adjust entry based on S/R if near a level
  const nearLevel = tech.indicators?.bbPosition < 0.2 || tech.indicators?.bbPosition > 0.8;
  
  if (direction === 'LONG') {
    // Stop loss below support or ATR
    const srStop = calculateSRLoss('LONG', currentPrice, sr.supports, sr.resistances, atr);
    const atrStop = currentPrice * (1 - atrPercent * 2);
    stopLoss = Math.max(srStop, atrStop);
    
    // Take profit: 2:1 minimum, 3:1 if strong
    const risk = currentPrice - stopLoss;
    const whaleBoost = whales.signal.includes('BUY') ? 0.5 : 0;
    const rr = 2 + whaleBoost;
    takeProfit = currentPrice + (risk * rr);
    
    // Adjust entry if we want to wait for better entry
    if (tech.indicators?.bbPosition < 0.15) {
      entry = currentPrice; // Already at support
    }
    
  } else if (direction === 'SHORT') {
    const srStop = calculateSRLoss('SHORT', currentPrice, sr.supports, sr.resistances, atr);
    const atrStop = currentPrice * (1 + atrPercent * 2);
    stopLoss = Math.min(srStop, atrStop);
    
    const risk = stopLoss - currentPrice;
    const whaleBoost = whales.signal.includes('SELL') ? 0.5 : 0;
    const rr = 2 + whaleBoost;
    takeProfit = currentPrice - (risk * rr);
    
    if (tech.indicators?.bbPosition > 0.85) {
      entry = currentPrice; // Already at resistance
    }
    
  } else {
    // HOLD - no position
    stopLoss = currentPrice * 0.98;
    takeProfit = currentPrice * 1.04;
  }
  
  return {
    entry: parseFloat(entry.toFixed(8)),
    stopLoss: parseFloat(stopLoss.toFixed(8)),
    takeProfit: parseFloat(takeProfit.toFixed(8))
  };
}

/**
 * Calculate risk:reward ratio
 */
function calculateRiskReward(entry, stopLoss, takeProfit) {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  
  if (risk === 0) return 0;
  return parseFloat((reward / risk).toFixed(2));
}

/**
 * Generate detailed reasons for the signal
 */
function generateReasons(tech, sentiment, whales, srCheck, marketSentiment) {
  const reasons = [];
  
  // Technical reasons
  if (tech.indicators?.rsi < 30) reasons.push('RSI deeply oversold');
  if (tech.indicators?.rsi > 70) reasons.push('RSI deeply overbought');
  if (tech.indicators?.macd.histogram > 0) reasons.push('MACD histogram positive');
  if (tech.indicators?.ema9 > tech.indicators?.ema21) reasons.push('EMA bullish crossover');
  if (tech.indicators?.volumeRatio > 1.5) reasons.push('High volume surge');
  if (tech.indicators?.cci < -100) reasons.push('CCI extremely oversold');
  if (tech.indicators?.williamsR < -80) reasons.push('Williams %R oversold');
  if (tech.indicators?.mfi < 20) reasons.push('MFI extremely oversold');
  
  // Sentiment reasons
  if (sentiment.adjustment > 0) reasons.push(`Bullish sentiment (${sentiment.reason})`);
  if (sentiment.adjustment < 0) reasons.push(`Bearish sentiment (${sentiment.reason})`);
  
  // Whale reasons
  if (whales.signal.includes('BUY')) reasons.push(`Whale buying detected (${whales.whaleCount} whales)`);
  if (whales.signal.includes('SELL')) reasons.push(`Whale selling detected (${whales.whaleCount} whales)`);
  if (whales.buyRatio > 60) reasons.push(`High buy volume ratio: ${whales.buyRatio}`);
  
  // S/R reasons
  if (srCheck.recommended) reasons.push(srCheck.reason);
  
  // Market reasons
  if (marketSentiment.label === 'EXTREME_GREED') reasons.push('Market in Extreme Greed');
  if (marketSentiment.label === 'EXTREME_FEAR') reasons.push('Market in Extreme Fear');
  
  return reasons;
}

/**
 * Scan market with enhanced signals
 */
async function scanMarketEnhanced(symbols = null) {
  if (!symbols) {
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 
               'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'];
  }
  
  const signals = [];
  
  for (const symbol of symbols) {
    try {
      const candles = await fetchPriceData(symbol, 200);
      
      if (candles && candles.length > 0) {
        const signal = await generateSignalV4(symbol, candles);
        
        if (signal.direction !== 'HOLD' && signal.confidence >= CONFIG.minConfidence) {
          // Additional filter: require sentiment or whale confirmation
          const sentimentOk = signal.indicators.sentiment.score >= 30 && 
                              signal.indicators.sentiment.score <= 70;
          const whaleOk = signal.indicators.whales.confidence >= 30 || 
                         signal.indicators.whales.signal === 'HOLD';
          
          if (sentimentOk || whaleOk || signal.confidence >= 70) {
            signals.push(signal);
          }
        }
      }
    } catch (err) {
      console.log(`Error scanning ${symbol}:`, err.message);
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  return signals;
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
  generateSignalV4,
  scanMarketEnhanced,
  fetchPriceData,
  CONFIG
};
