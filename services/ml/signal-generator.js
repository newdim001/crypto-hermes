/**
 * ML Signal Generator v2
 * Combines technical indicators with AI for trading signals
 * Ported from kvantedge/trading-bot ML Trading v2
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');
const { 
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
  calculateAllIndicators
} = require('./technical-indicators');

// ============================================
// SIGNAL GENERATOR
// ============================================

/**
 * Generate comprehensive ML trading signal
 */
async function generateSignal(symbol, priceData, useAI = true) {
  const candles = priceData;
  
  if (!candles || candles.length < 50) {
    return { error: 'Insufficient price data', symbol };
  }
  
  const current = candles[candles.length - 1];
  const currentPrice = current.close;
  
  // Calculate all indicators
  const indicators = calculateAllIndicators(candles);
  
  if (!indicators) {
    return { error: 'Failed to calculate indicators', symbol };
  }
  
  // Multi-timeframe analysis
  const h1Trend = indicators.trend;
  const h4Candles = candles.slice(-96); // Last 4 days for 4h
  const h4RSI = h4Candles.length >= 50 ? calculateRSI(h4Candles) : indicators.rsi;
  const h4Trend = calculateEMA(h4Candles, 9) > calculateEMA(h4Candles, 21) ? 'bullish' : 'bearish';
  
  // Calculate component scores
  const scores = calculateScores(indicators);
  
  // Calculate weighted score
  const normalizedScore = calculateWeightedScore(scores);
  
  // Determine direction, confidence and market regime
  const { direction, confidence, regime } = determineSignal(normalizedScore, indicators, h1Trend, h4Trend);
  
  // Calculate stop loss and take profit
  const { stopLoss, takeProfit, stopPercent } = calculateRiskLevels(
    direction, 
    currentPrice, 
    indicators.atr, 
    indicators.adx.adx
  );
  
  // Position sizing
  const positionSize = calculatePositionSize(currentPrice, stopLoss);
  
  // Generate reasons
  const reasons = generateReasons(scores, indicators, h1Trend, h4Trend, regime);
  
  // Build signal object
  const signal = {
    symbol,
    direction,
    confidence,
    entryPrice: currentPrice,
    stopLoss: direction !== 'HOLD' ? stopLoss.toFixed(4) : null,
    takeProfit: direction !== 'HOLD' ? takeProfit.toFixed(4) : null,
    positionSize,
    riskReward: '1:2.5',
    reasons,
    indicators: {
      rsi: indicators.rsi.toFixed(1),
      macd: indicators.macd.histogram.toFixed(4),
      ema9: indicators.ema9.toFixed(2),
      ema21: indicators.ema21.toFixed(2),
      bb: `${indicators.bb.lower.toFixed(2)}-${indicators.bb.upper.toFixed(2)}`,
      stochastic: indicators.stochastic.k.toFixed(1),
      adx: indicators.adx.adx.toFixed(1),
      volumeRatio: indicators.volumeRatio.toFixed(2),
      h1Trend,
      h4Trend,
      patterns: detectPatterns(candles).map(p => p.name).join(', ') || 'none'
    },
    mlScore: normalizedScore.toFixed(1),
    regime: regime, // SIDEWAYS, TRENDING, or STRONG_TREND
    timestamp: new Date().toISOString()
  };
  
  // Optionally enhance with DeepSeek AI
  if (useAI && CONFIG.DEEPSEEK_API_KEY) {
    try {
      const aiEnhancement = await enhanceWithAI(symbol, signal, indicators);
      if (aiEnhancement) {
        signal.aiConfidence = aiEnhancement.confidence;
        signal.aiReasoning = aiEnhancement.reasoning;
        signal.direction = aiEnhancement.direction || signal.direction;
        signal.confidence = Math.max(signal.confidence, aiEnhancement.confidence);
      }
    } catch (err) {
      console.log('AI enhancement skipped:', err.message);
    }
  }
  
  return signal;
}

/**
 * Calculate component scores
 */
function calculateScores(indicators) {
  const scores = {};
  
  // RSI (0-100, oversold <30, overbought >70)
  scores.rsi = indicators.rsi < 30 ? 80 : indicators.rsi > 70 ? -80 : (50 - indicators.rsi) * 1.6;
  
  // MACD
  const macdScore = indicators.macd.histogram > 0 ? 60 : -60;
  scores.macd = indicators.macd.histogram > 0 && indicators.macd.macdLine > 0 ? 80 : macdScore;
  
  // EMA Crossover
  scores.ema = indicators.ema9 > indicators.ema21 ? 70 : -70;
  
  // Bollinger Bands
  const bbPosition = indicators.bbPosition;
  scores.bb = bbPosition < 0.2 ? 75 : bbPosition > 0.8 ? -75 : (0.5 - bbPosition) * 100;
  
  // Stochastic
  scores.stochastic = indicators.stochastic.k < 20 ? 70 : 
                      indicators.stochastic.k > 80 ? -70 : 
                      (50 - indicators.stochastic.k);
  
  // ADX (trend strength)
  scores.adx = indicators.adx.adx > 25 ? indicators.adx.adx : -10;
  
  // Volume
  scores.volume = indicators.volumeRatio > 1 ? 50 : -30;
  
  // Pattern recognition
  // Note: We can't call detectPatterns here without candles, 
  // so this is handled separately in the main function
  
  return scores;
}

/**
 * Calculate weighted score
 */
function calculateWeightedScore(scores) {
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const [key, weight] of Object.entries(CONFIG.WEIGHTS)) {
    totalScore += (scores[key] || 0) * weight;
    totalWeight += weight;
  }
  
  return totalScore / totalWeight;
}

/**
 * Determine signal direction and confidence
 */
function determineSignal(normalizedScore, indicators, h1Trend, h4Trend) {
  let direction = 'HOLD';
  let confidence = 0;
  let regime = 'TRENDING'; // Default regime
  
  // Determine market regime based on ADX
  const adx = indicators.adx.adx;
  if (adx < 20) {
    regime = 'SIDEWAYS'; // Ranging/no trend market
  } else if (adx > 40) {
    regime = 'STRONG_TREND';
  }
  
  // =============================================
  // SIDEWAYS/RANGING MARKET STRATEGY
  // In ranging markets: mean reversion works best
  // Buy at support (RSI oversold + price near lower BB)
  // Sell at resistance (RSI overbought + price near upper BB)
  // =============================================
  if (regime === 'SIDEWAYS') {
    const currentPrice = indicators.price;
    const bbLower = indicators.bb.lower;
    const bbUpper = indicators.bb.upper;
    const bbMiddle = (bbLower + bbUpper) / 2;
    const bbWidth = bbUpper - bbLower;
    const pricePosition = bbWidth > 0 ? (currentPrice - bbLower) / bbWidth : 0.5; // 0 = at lower band, 1 = at upper band
    
    // Mean reversion LONG: price at lower band + RSI oversold = potential bounce
    const rsiOversold = indicators.rsi < 35;
    const nearLowerBand = pricePosition < 0.25; // Within 25% of lower band
    
    if (rsiOversold && nearLowerBand) {
      direction = 'LONG';
      // Higher confidence if RSI is VERY oversold and price bounced before
      confidence = Math.min(80, (40 - indicators.rsi) * 2 + 20);
    }
    
    // Mean reversion SHORT: price at upper band + RSI overbought = potential drop
    const rsiOverbought = indicators.rsi > 65;
    const nearUpperBand = pricePosition > 0.75; // Within 25% of upper band
    
    if (rsiOverbought && nearUpperBand) {
      direction = 'SHORT';
      confidence = Math.min(80, (indicators.rsi - 60) * 2 + 20);
    }
    
    // Additional sideways signal: RSI extreme + price near band
    if (indicators.rsi < 30 && indicators.volumeRatio > 1.2) {
      direction = 'LONG';
      confidence = Math.max(confidence, 75);
    }
    if (indicators.rsi > 70 && indicators.volumeRatio > 1.2) {
      direction = 'SHORT';
      confidence = Math.max(confidence, 75);
    }
    
    return { direction, confidence: Math.round(confidence), regime };
  }
  
  // =============================================
  // TRENDING MARKET STRATEGY (normal mode)
  // Follow trend: buy on dips in uptrend, sell on rallies in downtrend
  // =============================================
  
  // RSI deeply oversold = potential reversal (contrarian in strong trend)
  const rsiOversold = indicators.rsi < 25;
  const rsiOverbought = indicators.rsi > 75;
  
  if (rsiOversold && normalizedScore > -10) {
    // RSI deeply oversold - potential LONG
    direction = 'LONG';
    confidence = Math.min(85, (30 - indicators.rsi) * 2 + 30);
  } else if (rsiOverbought && normalizedScore > 10) {
    // RSI overbought - potential SHORT
    direction = 'SHORT';
    confidence = Math.min(85, (indicators.rsi - 70) * 2 + 30);
  } else if (normalizedScore > 10 && h1Trend === h4Trend) {
    direction = 'LONG';
    confidence = Math.min(90, Math.abs(normalizedScore) + 25);
  } else if (normalizedScore < -10 && h1Trend === h4Trend) {
    direction = 'SHORT';
    confidence = Math.min(90, Math.abs(normalizedScore) + 25);
  } else if (normalizedScore > 20) {
    direction = 'LONG';
    confidence = Math.min(75, Math.abs(normalizedScore) + 15);
  } else if (normalizedScore < -20) {
    direction = 'SHORT';
    confidence = Math.min(75, Math.abs(normalizedScore) + 15);
  }
  
  return { direction, confidence: Math.round(confidence), regime };
}

/**
 * Calculate stop loss and take profit levels
 */
function calculateRiskLevels(direction, currentPrice, atr, adx) {
  if (direction === 'HOLD') {
    return { stopLoss: 0, takeProfit: 0, stopPercent: 0 };
  }
  
  const stopPercent = 1.5 + (adx / 50); // Dynamic stop based on volatility
  
  let stopLoss, takeProfit;
  if (direction === 'LONG') {
    stopLoss = currentPrice * (1 - stopPercent / 100);
    takeProfit = currentPrice * (1 + (stopPercent * 2.5) / 100);
  } else {
    stopLoss = currentPrice * (1 + stopPercent / 100);
    takeProfit = currentPrice * (1 - (stopPercent * 2.5) / 100);
  }
  
  return { stopLoss, takeProfit, stopPercent };
}

/**
 * Calculate position size based on risk
 */
function calculatePositionSize(entryPrice, stopLoss, accountBalance = 10000) {
  if (!stopLoss || stopLoss === 0) return 0.01;
  
  const riskAmount = (accountBalance * CONFIG.riskPerTrade) / 100;
  const riskPerUnit = Math.abs(entryPrice - stopLoss);
  const size = riskAmount / riskPerUnit;
  
  // Normalize to reasonable quantities
  if (entryPrice < 1) return Math.floor(size * 1000) / 1000;
  if (entryPrice < 10) return Math.floor(size * 100) / 100;
  if (entryPrice < 100) return Math.floor(size * 100) / 100;
  return Math.floor(size * 10000) / 10000;
}

/**
 * Generate human-readable reasons for signal
 */
function generateReasons(scores, indicators, h1Trend, h4Trend, regime) {
  const reasons = [];
  
  // Add market regime
  if (regime === 'SIDEWAYS') reasons.push('SIDEWAYS market — mean reversion mode');
  else if (regime === 'STRONG_TREND') reasons.push('STRONG TREND — momentum mode');
  
  if (scores.rsi > 30) reasons.push(`RSI oversold (${indicators.rsi.toFixed(0)})`);
  else if (scores.rsi < -30) reasons.push(`RSI overbought (${indicators.rsi.toFixed(0)})`);
  
  if (scores.macd > 40) reasons.push('MACD bullish crossover');
  else if (scores.macd < -40) reasons.push('MACD bearish crossover');
  
  if (scores.ema > 50) reasons.push('EMA golden cross');
  else if (scores.ema < -50) reasons.push('EMA death cross');
  
  if (scores.bb > 30) reasons.push('Near lower Bollinger Band');
  else if (scores.bb < -30) reasons.push('Near upper Bollinger Band');
  
  if (indicators.volumeRatio > 1.2) reasons.push('High volume confirmation');
  else if (indicators.volumeRatio < 0.8) reasons.push('Low volume warning');
  
  if (h1Trend === h4Trend) reasons.push(`${h1Trend.toUpperCase()} alignment (1H + 4H)`);
  else reasons.push('Timeframe divergence');
  
  if (indicators.adx.adx > 30) reasons.push(`Strong trend (ADX: ${indicators.adx.adx.toFixed(0)})`);
  else if (indicators.adx.adx < 20) reasons.push(`Range-bound (ADX: ${indicators.adx.adx.toFixed(0)})`);
  
  return reasons;
}

/**
 * Enhance signal with DeepSeek AI
 */
async function enhanceWithAI(symbol, signal, indicators) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  
  const prompt = `Analyze this trading signal for ${symbol}:

Current Price: ${signal.entryPrice}
Direction: ${signal.direction}
Confidence: ${signal.confidence}%
ML Score: ${signal.mlScore}

Technical Indicators:
- RSI: ${indicators.rsi.toFixed(1)}
- MACD Histogram: ${indicators.macd.histogram.toFixed(4)}
- EMA 9/21: ${indicators.ema9.toFixed(2)} / ${indicators.ema21.toFixed(2)}
- Bollinger Bands: ${indicators.bb.lower.toFixed(2)} - ${indicators.bb.upper.toFixed(2)}
- Stochastic: ${indicators.stochastic.k.toFixed(1)}
- ADX: ${indicators.adx.adx.toFixed(1)}
- Volume Ratio: ${indicators.volumeRatio.toFixed(2)}

Provide a brief analysis and confirm or override the signal direction. Return JSON with:
{"confidence": 0-100, "reasoning": "brief text", "direction": "LONG/SHORT/HOLD"}`;

  try {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const content = response.data.choices[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return null;
  } catch (err) {
    console.error('AI enhancement error:', err.message);
    return null;
  }
}

/**
 * Scan multiple symbols and return best opportunities
 */
async function scanMarket(symbols, binanceConnector) {
  const signals = [];
  
  for (const symbol of symbols) {
    try {
      const candles = await binanceConnector.getKlines(symbol, '1h', 100);
      if (candles && candles.length >= 50) {
        const signal = await generateSignal(symbol, candles, false);
        if (signal.confidence >= CONFIG.minConfidence && signal.direction !== 'HOLD') {
          signals.push(signal);
        }
      }
    } catch (err) {
      console.error(`Error scanning ${symbol}:`, err.message);
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  return signals;
}

module.exports = {
  generateSignal,
  scanMarket,
  calculatePositionSize,
  calculateAllIndicators,
  detectPatterns
};
