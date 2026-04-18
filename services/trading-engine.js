/**
 * KvantEdge Trading Bot - Paper Trading Engine
 * Connects all skills for automated crypto trading
 * Includes ML + AI for smarter decisions
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const crypto = require('crypto');
const { DataValidator } = require('./data-validator');

// ML/AI Signal Generator
const { generateSignal: mlGenerateSignal, scanMarket } = require('./ml/signal-generator');

// DeepSeek AI Integration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Initialize data validator
const dataValidator = new DataValidator();

// Configuration
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BINANCE_BASE = 'https://api.binance.com'; // MAINNET - real prices
const BINANCE_TESTNET = false; // Paper trading with REAL market data
const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

// Bot Configuration - SYNCED with principles.js
const CONFIG = {
  initialCapital: 10000,
  paperBalance: 10000,
  riskPerTrade: 1,          // Max 1% risk per trade (from principles)
  maxPositionSize: 5,       // Max 5% per position (from principles)
  maxDailyTrades: 2,        // STRICT: Max 2/day (from principles)
  maxDailyLoss: 2,         // 2% daily loss limit
  cooldownAfterLosses: 3,
  maxOpenPositions: 3,     // Max 3 simultaneous
  watchlist: ['BTCUSDT', 'ETHUSDT'], // Only BTC & ETH
  minConfidence: 75,        // STRICT: 75% min (from principles)
  minRiskReward: 2.5,      // STRICT: 2.5:1 R:R (from principles)
};

// Trading mode - read from environment
const IS_PAPER_TRADING = process.env.BOT_MODE !== 'real';

// Exit Configuration - SYNCED with principles.js
const EXIT_CONFIG = {
  stopLossPercent: 1.5,    // 1.5% stop loss (from principles)
  takeProfitPercent: 3.75, // 3.75% take profit (2.5:1 R:R)
  maxHoldTimeHours: 24,    // Hold up to 24 hours (from principles)
  trailingStopPercent: 1.0,
  exitOnSignalReverse: true,
  checkExitEveryMinutes: 15
};

// ============================================
// FEE CONFIGURATION (Binance)
// ============================================
const FEE_CONFIG = {
  spotMaker: 0.001,      // 0.1%
  spotTaker: 0.001,      // 0.1%
  futuresMaker: 0.0002,  // 0.02%
  futuresTaker: 0.0005,  // 0.05%
  bnbDiscount: 0.25,     // 25% discount with BNB
  useBnbForFees: false,  // Set true to use BNB discount
  // FDUSD pairs have 0% maker fees
  fdusdPairs: ['BTCFDUSD', 'ETHFDUSD', 'BNBFDUSD', 'SOLFDUSD', 'XRPFDUSD', 'DOGEFDUSD']
};

// ============================================
// SLIPPAGE CONFIGURATION
// ============================================
const SLIPPAGE_CONFIG = {
  tolerancePercent: 0.5,  // Max 0.5% slippage allowed
  maxRetries: 3,           // Retry orders on slippage
  priceImprovement: true,  // Accept better prices
  orderType: 'market'      // Order type
};

function calculateSlippagePrice(price, side, tolerancePercent = SLIPPAGE_CONFIG.tolerancePercent) {
  // Slippage = worst case execution price deviation
  // For BUY: price could go up (slippage bad)
  // For SELL: price could go down (slippage bad)
  const slippageMultiplier = side === 'BUY' 
    ? (1 + tolerancePercent / 100)   // Price goes up
    : (1 - tolerancePercent / 100);  // Price goes down
  
  return {
    expected: price,
    worstCase: price * slippageMultiplier,
    slippagePercent: tolerancePercent,
    slippageCost: price * (tolerancePercent / 100)
  };
}

function checkSlippageTolerable(expectedPrice, executedPrice, side) {
  const slippage = side === 'BUY' 
    ? (executedPrice - expectedPrice) / expectedPrice * 100
    : (expectedPrice - executedPrice) / expectedPrice * 100;
  
  return {
    tolerable: slippage <= SLIPPAGE_CONFIG.tolerancePercent,
    slippagePercent: slippage,
    message: slippage <= SLIPPAGE_CONFIG.tolerancePercent 
      ? '✅ Slippage within tolerance' 
      : `⚠️ Slippage ${slippage.toFixed(2)}% exceeds ${SLIPPAGE_CONFIG.tolerancePercent}% limit`
  };
}

function calculateFee(symbol, amount, price, side) {
  const isMaker = side === 'limit' ? true : false;
  const pair = symbol.replace('USDT', 'FDUSD');
  const isFdusdPair = FEE_CONFIG.fdusdPairs.includes(pair);
  
  let rate = isMaker ? FEE_CONFIG.spotMaker : FEE_CONFIG.spotTaker;
  
  // FDUSD pairs: 0% maker fee
  if (isFdusdPair && isMaker) {
    rate = 0;
  }
  
  // BNB discount
  if (FEE_CONFIG.useBnbForFees) {
    rate *= (1 - FEE_CONFIG.bnbDiscount);
  }
  
  const tradeValue = amount * price;
  return tradeValue * rate;
}

function calculateNetProfit(entryPrice, exitPrice, quantity, symbol) {
  // Entry fee
  const entryFee = calculateFee(symbol, quantity, entryPrice, 'market');
  // Exit fee
  const exitFee = calculateFee(symbol, quantity, exitPrice, 'market');
  // Gross P&L
  const grossPnL = (exitPrice - entryPrice) * quantity;
  // Net P&L (subtract both fees)
  const netPnL = grossPnL - entryFee - exitFee;
  const totalFees = entryFee + exitFee;
  
  return { grossPnL, netPnL, entryFee, exitFee, totalFees };
}

// ============================================
// BINANCE CONNECTOR
// ============================================

function binanceRequest(endpoint, params = {}) {
  const timestamp = Date.now();
  const { method, ...restParams } = params;
  const queryString = new URLSearchParams({ ...restParams, timestamp, recvWindow: 5000 }).toString();
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
  
  const url = `${BINANCE_BASE}${endpoint}?${queryString}&signature=${signature}`;
  console.log('Request URL:', url.replace(SECRET_KEY, '***'));
  
  return axios({
    method: params.method || 'GET',
    url,
    headers: { 'X-MBX-APIKEY': API_KEY }
  }).then(r => r.data).catch(e => {
    console.error('Binance Error:', e.response?.data || e.message);
    throw e;
  });
}

async function getPrice(symbol) {
  const r = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  return parseFloat(r.data.price);
}

async function getKlines(symbol, interval = '1h', limit = 100) {
  const r = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  return r.data.map(k => ({
    time: k[0] / 1000,
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
}

async function getAccountBalance() {
  if (IS_PAPER_TRADING) {
    // PRIMARY: Read from local state.json (always reliable)
    try {
      const state = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/state.json'), 'utf8'));
      if (state.balance && state.balance > 0) return { USDT: state.balance, total: state.balance };
    } catch(_) {}
    // FALLBACK: hardcoded starting balance
    return { USDT: CONFIG.paperBalance, total: CONFIG.paperBalance };
  }
  const account = await binanceRequest('/api/v3/account');
  const usdt = account.balances.find(b => b.asset === 'USDT');
  return { USDT: parseFloat(usdt?.free || 0), total: parseFloat(usdt?.free || 0) };
}

// Save balance to state.json and Supabase account table
async function saveBalance(usdt) {
  try {
    const sp = path.join(__dirname, '../data/state.json');
    let state = {};
    try { state = JSON.parse(fs.readFileSync(sp,'utf8')); } catch(_) {}
    state.balance = parseFloat(usdt.toFixed(4));
    state.lastSaved = Date.now();
    fs.writeFileSync(sp, JSON.stringify(state, null, 2));
    fs.writeFileSync(sp.replace('state.json','trading-state.json'), JSON.stringify(state, null, 2));
  } catch(_) {}
}

async function placeMarketOrder(symbol, side, quantity, expectedPrice) {
  if (IS_PAPER_TRADING) {
    // PAPER TRADING: Simulate order execution
    console.log(`   📝 [PAPER] Would ${side} ${quantity} ${symbol} @ $${expectedPrice}`);
    
    // Simulate order response
    const order = {
      symbol,
      side: side.toUpperCase(),
      type: 'MARKET',
      quantity,
      price: expectedPrice,
      status: 'FILLED',
      orderId: Math.floor(Math.random() * 1000000),
      transactTime: Date.now()
    };
    
    // Check slippage (theoretical)
    if (expectedPrice) {
      const slippageCheck = checkSlippageTolerable(expectedPrice, expectedPrice, side);
      console.log(`   📉 Slippage: 0.000% (theoretical)`);
    }
    
    return order;
  } else {
    // REAL TRADING: Place actual order on Binance
    console.log(`   🚀 [REAL] Placing ${side} order for ${quantity} ${symbol} @ ~$${expectedPrice}`);
    
    try {
      // Get current price for better accuracy
      const currentPrice = await getPrice(symbol);
      console.log(`   📊 Current market price: $${currentPrice}`);
      
      // Place market order
      const order = await binanceRequest('/api/v3/order', {
        method: 'POST',
        symbol: symbol.replace('USDT', ''),
        side: side.toUpperCase(),
        type: 'MARKET',
        quantity: quantity.toFixed(8), // Binance precision
        timestamp: Date.now()
      });
      
      console.log(`   ✅ Order placed! ID: ${order.orderId}`);
      console.log(`   💰 Executed price: $${order.price || currentPrice}`);
      
      // Calculate actual slippage
      if (expectedPrice && order.price) {
        const slippage = checkSlippageTolerable(expectedPrice, parseFloat(order.price), side);
        console.log(`   📉 Actual slippage: ${slippage.toFixed(3)}%`);
      }
      
      return order;
      
    } catch (error) {
      console.error(`   ❌ Order failed: ${error.message}`);
      console.error(`   Details:`, error.response?.data || error);
      throw error;
    }
  }
}

// ============================================
// TECHNICAL ANALYSIS
// ============================================

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

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0].close;
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i].close * k + ema * (1 - k);
  }
  return ema;
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  const signalLine = macdLine * 0.9; // Simplified
  return { macdLine, signalLine, histogram: macdLine - signalLine };
}

function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return { upper: 0, middle: 0, lower: 0 };
  const closes = prices.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const variance = closes.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  return { upper: sma + std * stdDev, middle: sma, lower: sma - std * stdDev };
}

function calculateATR(prices, period = 14) {
  if (prices.length < period + 1) return 0;
  let atr = 0;
  for (let i = 1; i <= period; i++) {
    const high = prices[i].high;
    const low = prices[i].low;
    const prevClose = prices[i-1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    atr += tr;
  }
  return atr / period;
}

function calculateVolumeSMA(prices, period = 20) {
  if (prices.length < period) return 0;
  const recent = prices.slice(-period).map(c => c.volume);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ============================================
// SIGNAL GENERATION
// ============================================

// ============================================
// TRADING IMPROVEMENTS (from audit)
// ============================================

// Timeframe hierarchy: higher timeframes dominate
const TIMEFRAME_HIERARCHY = {
  '4h': 0.2,  // Entry timing
  '1d': 0.5,  // Secondary trend - PRIMARY
  '1w': 0.3   // Major trend
};

// Minimum volume threshold for breakout confirmation
const VOLUME_CONFIG = {
  minVolumeMultiplier: 1.5,  // Volume must be 1.5x average
  checkVolume: true
};

async function getHigherTimeframeSignal(symbol) {
  // Check daily timeframe for trend direction
  try {
    const dailyCandles = await getKlines(symbol, '1d', 30);
    const dailyEma9 = calculateEMA(dailyCandles, 9);
    const dailyEma21 = calculateEMA(dailyCandles, 21);
    const dailyRsi = calculateRSI(dailyCandles);
    const dailyVolume = dailyCandles.slice(-5).reduce((s, c) => s + c.volume, 0) / 5;
    
    // Determine daily trend
    let dailyTrend = 'NEUTRAL';
    if (dailyEma9 > dailyEma21) dailyTrend = 'BULLISH';
    else if (dailyEma9 < dailyEma21) dailyTrend = 'BEARISH';
    
    return {
      trend: dailyTrend,
      rsi: dailyRsi,
      volume: dailyVolume,
      ema9: dailyEma9,
      ema21: dailyEma21
    };
  } catch (e) {
    return { trend: 'NEUTRAL', rsi: 50, volume: 0 };
  }
}

function checkVolumeConfirmation(candles) {
  // Check if volume confirms the move
  const recentVolume = candles.slice(-5).map(c => c.volume);
  const avgVolume = recentVolume.reduce((a, b) => a + b, 0) / 5;
  const currentVolume = candles[candles.length - 1].volume;
  const volumeRatio = currentVolume / avgVolume;
  
  return {
    confirmed: volumeRatio >= VOLUME_CONFIG.minVolumeMultiplier,
    ratio: volumeRatio,
    avgVolume,
    currentVolume
  };
}

// ============================================
// AI ANALYSIS (DeepSeek)
// ============================================
async function analyzeWithAI(symbol, indicators, priceData) {
  if (!DEEPSEEK_API_KEY) {
    console.log(`   🤖 AI: No API key configured`);
    return null;
  }
  
  try {
    const currentPrice = priceData[priceData.length - 1].close;
    const recentPrices = priceData.slice(-20).map(c => c.close);
    
    const prompt = `Analyze this crypto trading signal for ${symbol}:

Current Price: $${currentPrice}
RSI (14): ${indicators.rsi?.toFixed(1)}
MACD: ${indicators.macd?.macdLine?.toFixed(2)} (signal: ${indicators.macd?.signalLine?.toFixed(2)}, hist: ${indicators.macd?.histogram?.toFixed(2)})
EMA 9: ${indicators.ema9?.toFixed(2)}
EMA 21: ${indicators.ema21?.toFixed(2)}
Bollinger Bands: Upper ${indicators.bb?.upper?.toFixed(2)}, Middle ${indicators.bb?.middle?.toFixed(2)}, Lower ${indicators.bb?.lower?.toFixed(2)}
ATR: ${indicators.atr?.toFixed(2)}
Volume: ${indicators.volume?.toFixed(2)}

Recent prices: ${recentPrices.slice(-5).join(', ')}

Should we LONG, SHORT, or HOLD? Reply in this exact format:
DIRECTION: [LONG/SHORT/HOLD]
CONFIDENCE: [0-100]
REASON: [brief explanation]`;    

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      },
      { headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    
    const reply = response.data.choices[0].message.content;
    const directionMatch = reply.match(/DIRECTION:\s*(LONG|SHORT|HOLD)/i);
    const confidenceMatch = reply.match(/CONFIDENCE:\s*(\d+)/i);
    
    if (directionMatch && confidenceMatch) {
      return {
        direction: directionMatch[1].toUpperCase(),
        confidence: parseInt(confidenceMatch[1]),
        reason: reply.match(/REASON:\s*(.+)/i)?.[1] || 'AI analysis'
      };
    }
  } catch (e) {
    console.log(`   🤖 AI Error: ${e.message?.slice(0, 50)}`);
  }
  return null;
}

async function generateSignal(symbol) {
  const candles = await getKlines(symbol, '1h', 100);
  const currentPrice = candles[candles.length - 1].close;
  
  // Validate data before generating signal
  const validation = await dataValidator.validateForTrading(symbol, currentPrice, candles);
  
  // Calculate indicators
  const rsi = calculateRSI(candles);
  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const macd = calculateMACD(candles);
  
  // Bollinger Bands & ATR for AI analysis
  const bb = calculateBollingerBands(candles);
  const atr = calculateATR(candles);
  const volumeSMA = calculateVolumeSMA(candles);
  
  // NEW: Get higher timeframe confirmation
  const htf = await getHigherTimeframeSignal(symbol);
  
  // NEW: Volume confirmation
  const volumeCheck = checkVolumeConfirmation(candles);
  
  if (!validation.canTrade) {
    console.log(`   ⚠️ Data validation failed for ${symbol}:`);
    validation.errors.forEach(e => console.log(`      - ${e}`));
    return {
      symbol,
      direction: 'HOLD',
      confidence: 0,
      entryPrice: currentPrice,
      stopLoss: 0,
      takeProfit: 0,
      positionSize: 0,
      feeRate: 0,
      reason: `Validation failed: ${validation.errors.join(', ')}`,
      indicators: { rsi, ema9, ema21, macd },
      validation
    };
  }
  
  if (validation.warnings.length > 0) {
    console.log(`   ⚡ ${symbol} warnings: ${validation.warnings.join(', ')}`);
  }
  
  // Simple signal logic
  let signals = [];
  let reasons = [];
  
  // RSI signals
  if (rsi < 30) {
    signals.push('BUY');
    reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
  } else if (rsi > 70) {
    signals.push('SELL');
    reasons.push(`RSI overbought (${rsi.toFixed(1)})`);
  }
  
  // EMA signals
  if (ema9 > ema21) {
    signals.push('BUY');
    reasons.push('Bullish EMA crossover');
  } else if (ema9 < ema21) {
    signals.push('SELL');
    reasons.push('Bearish EMA crossover');
  }
  
  // MACD signals
  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
    signals.push('BUY');
    reasons.push('MACD bullish');
  } else if (macd.histogram < 0) {
    signals.push('SELL');
    reasons.push('MACD bearish');
  }
  
  // Determine final signal
  const buySignals = signals.filter(s => s === 'BUY').length;
  const sellSignals = signals.filter(s => s === 'SELL').length;
  
  // ============================================
  // APPLY TRADING IMPROVEMENTS
  // ============================================
  
  // Determine base direction first
  let direction = 'HOLD';
  let confidence = 0;
  
  if (buySignals > sellSignals && buySignals >= 2) {
    direction = 'LONG';
    confidence = Math.min(100, buySignals * 30 + 20);
  } else if (sellSignals > buySignals && sellSignals >= 2) {
    direction = 'SHORT';
    confidence = Math.min(100, sellSignals * 30 + 20);
  }
  
  // 1. Timeframe Hierarchy: Higher timeframe must align
  // If 1D trend is bearish, reduce LONG confidence significantly
  let htfAlignment = 1.0;
  let htfReason = '';
  
  if (direction === 'LONG' && htf.trend === 'BEARISH') {
    htfAlignment = 0.3;  // Reduce confidence significantly
    htfReason = ' (1Dtrend opposing)';
  } else if (direction === 'SHORT' && htf.trend === 'BULLISH') {
    htfAlignment = 0.3;
    htfReason = ' (1Dtrend opposing)';
  } else if (direction !== 'HOLD' && htf.trend === direction) {
    htfAlignment = 1.3;  // Boost confidence
    htfReason = ' (1Dtrend aligned)';
  }
  
  // 2. Volume Confirmation: Low volume = weak signal
  let volumePenalty = 1.0;
  if (!volumeCheck.confirmed && direction !== 'HOLD') {
    volumePenalty = 0.5;  // Halve confidence for low volume
    reasons.push(`⚠️ Low volume (${volumeCheck.ratio.toFixed(1)}x avg)`);
  } else if (volumeCheck.confirmed && direction !== 'HOLD') {
    reasons.push(`✅ Volume confirmed (${volumeCheck.ratio.toFixed(1)}x avg)`);
  }
  
  // Log HTF info
  console.log(`   📊 HTF: ${htf.trend}${htfReason} | Vol: ${volumeCheck.ratio.toFixed(1)}x`);
  
  // Apply HTF and Volume adjustments to confidence
  if (direction !== 'HOLD') {
    confidence = Math.round(confidence * htfAlignment * volumePenalty);
    reasons.push(`Confidence adjusted: x${(htfAlignment * volumePenalty).toFixed(1)}`);
  }
  
  // ============================================
  // 🤖 AI + ML ENHANCEMENT
  // ============================================
  try {
    // Get ML signal from signal-generator
    console.log(`   🤖 ML Analysis for ${symbol}...`);
    const mlSignal = await mlGenerateSignal(symbol, candles, false);
    if (mlSignal && mlSignal.confidence > 0) {
      console.log(`   🤖 ML: ${mlSignal.direction} (${mlSignal.confidence}%) - ${mlSignal.reason}`);
      
      // Combine ML signal with technical analysis
      if (mlSignal.direction !== 'HOLD' && mlSignal.confidence > 50) {
        // If ML agrees with our direction, boost confidence
        if (mlSignal.direction === direction) {
          confidence = Math.round((confidence + mlSignal.confidence) / 2 + 10);
          reasons.push(`🤖 ML aligned - boosted to ${confidence}%`);
        } else if (confidence < mlSignal.confidence - 20) {
          // If ML is stronger, override
          direction = mlSignal.direction;
          confidence = mlSignal.confidence;
          reasons.push(`🤖 ML override: ${direction} at ${confidence}%`);
        }
      }
    }
    
    // Get DeepSeek AI analysis
    const aiSignal = await analyzeWithAI(symbol, { rsi, ema9, ema21, macd, bb, atr, volume: volumeCheck.ratio }, candles);
    if (aiSignal) {
      console.log(`   🧠 AI: ${aiSignal.direction} (${aiSignal.confidence}%) - ${aiSignal.reason}`);
      
      // Combine AI signal
      if (aiSignal.direction !== 'HOLD' && aiSignal.confidence > 60) {
        if (aiSignal.direction === direction) {
          confidence = Math.round((confidence + aiSignal.confidence) / 2 + 15);
          reasons.push(`🧠 AI aligned - boosted to ${confidence}%`);
        } else if (aiSignal.confidence > confidence + 20) {
          direction = aiSignal.direction;
          confidence = aiSignal.confidence;
          reasons.push(`🧠 AI override: ${direction} at ${confidence}%`);
        }
      }
    }
  } catch (e) {
    console.log(`   ⚠️ AI/ML Error: ${e.message?.slice(0, 50)}`);
  }
  
  // Enforce minimum confidence
  if (confidence < CONFIG.minConfidence) {
    direction = 'HOLD';
    reasons.push(`Below min confidence (${CONFIG.minConfidence}%)`);
  }
  
  // Calculate position size & stops
  const balance = await getAccountBalance();
  const riskAmount = (balance.USDT * CONFIG.riskPerTrade) / 100;
  const stopPercent = EXIT_CONFIG.stopLossPercent; // Use config
  // Use fixed small quantities for testnet to avoid precision issues
  let positionSize = 0.01; // Fixed for testnet
  if (currentPrice < 10) positionSize = 10; // For low price coins
  else if (currentPrice < 100) positionSize = 1;
  else if (currentPrice < 1000) positionSize = 0.1;
  else positionSize = 0.01;
  // Account for fees AND slippage in stop loss and take profit
  const entryFeeRate = FEE_CONFIG.spotTaker;
  const exitFeeRate = FEE_CONFIG.spotTaker;
  const totalFeeRate = entryFeeRate + exitFeeRate;
  const slippageRate = SLIPPAGE_CONFIG.tolerancePercent / 100;
  const totalCostRate = totalFeeRate + slippageRate;
  
  // Stop loss: account for fees + slippage so we don't lose more than intended
  const stopLoss = direction === 'LONG' 
    ? currentPrice * (1 - stopPercent/100 - totalCostRate) 
    : currentPrice * (1 + stopPercent/100 + totalCostRate);
  
  // Take profit: account for fees + slippage to ensure net profit
  const tpPercent = EXIT_CONFIG.takeProfitPercent;
  const takeProfit = direction === 'LONG' 
    ? currentPrice * (1 + tpPercent/100 + totalCostRate)   // TP% + fees + slippage
    : currentPrice * (1 - tpPercent/100 - totalCostRate);  // TP% - fees - slippage
  
  return {
    symbol,
    direction,
    confidence,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    positionSize,
    feeRate: totalFeeRate,
    reason: reasons.join(', '),
    // NEW: Thesis tracking for exits
    thesis: {
      entryReason: reasons[0] || 'signal',
      htfTrend: htf.trend,
      volumeConfirmed: volumeCheck.confirmed,
      invalidationLevels: {
        stopLoss: direction === 'LONG' ? stopLoss : stopLoss,
        priceActionInvalidation: direction === 'LONG' 
          ? ema21  // Exit if price breaks EMA21
          : ema21
      }
    },
    indicators: { rsi, ema9, ema21, macd, htfRsi: htf.rsi, volumeRatio: volumeCheck.ratio }
  };
}

// ============================================
// EXIT LOGIC (CRITICAL - FIXED)
// ============================================

async function checkExits(openTrades) {
  if (!openTrades || openTrades.length === 0) {
    console.log('📭 No open positions to check');
    return;
  }
  
  console.log(`\n🔄 Checking ${openTrades.length} open positions for exits...\n`);
  let exited = 0;
  
  for (const trade of openTrades) {
    try {
      const currentPrice = await getPrice(trade.symbol);
      const entryPrice = trade.entry_price;
      const direction = trade.side;
      const quantity = trade.quantity;
      const stopLoss = trade.stop_loss;
      const takeProfit = trade.take_profit;
      
      // Calculate current P&L
      const pnl = direction === 'LONG' 
        ? (currentPrice - entryPrice) * quantity
        : (entryPrice - currentPrice) * quantity;
      const pnlPercent = (pnl / (entryPrice * quantity)) * 100;
      
      // Check hold time
      const entryTime = new Date(trade.created_at);
      const hoursHeld = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60);
      
      let exitReason = null;
      let shouldExit = false;
      
      // Check stop loss
      const slHit = direction === 'LONG' 
        ? currentPrice <= stopLoss 
        : currentPrice >= stopLoss;
      
      // Check take profit
      const tpHit = direction === 'LONG' 
        ? currentPrice >= takeProfit 
        : currentPrice <= takeProfit;
      
      // Check max hold time
      const maxHoldExceeded = hoursHeld >= EXIT_CONFIG.maxHoldTimeHours;
      
      if (slHit) {
        exitReason = 'STOP_LOSS';
        shouldExit = true;
      } else if (tpHit) {
        exitReason = 'TAKE_PROFIT';
        shouldExit = true;
      } else if (maxHoldExceeded) {
        exitReason = 'MAX_HOLD_TIME';
        shouldExit = true;
      }
      
      if (shouldExit) {
        console.log(`🚪 EXIT ${trade.symbol}: ${exitReason}`);
        console.log(`   Entry: $${entryPrice.toFixed(4)} → Current: $${currentPrice.toFixed(4)}`);
        console.log(`   P&L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnl.toFixed(2)})`);
        
        // Execute exit
        await closePosition(trade, currentPrice, exitReason);
        exited++;
      } else {
        console.log(`📊 ${trade.symbol}: HOLD | ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% | ${hoursHeld.toFixed(1)}h held`);
      }
      
    } catch (e) {
      console.log(`❌ ${trade.symbol}: Exit check error - ${e.message}`);
    }
  }
  
  console.log(`\n✅ Exit check complete: ${exited} positions closed`);
  return exited;
}

async function closePosition(trade, exitPrice, reason) {
  const quantity = trade.quantity;
  const entryPrice = trade.entry_price;
  const direction = trade.side;
  const symbol = trade.symbol;
  
  // Calculate P&L
  const pnl = direction === 'LONG'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
  
  // Calculate fees
  const entryFee = calculateFee(symbol, quantity, entryPrice, 'market');
  const exitFee = calculateFee(symbol, quantity, exitPrice, 'market');
  const netPnl = pnl - entryFee - exitFee;
  
  // Update trade in database
  await supabase.from('trades').update({
    status: 'CLOSED',
    exit_price: exitPrice,
    
    pnl: parseFloat(netPnl.toFixed(4)),
    exit_price: exitPrice
  }).eq('id', trade.id);
  
  // Update balance
  const balance = await getAccountBalance();
  balance.USDT += netPnl;
  // Save updated balance
  await saveBalance(balance.USDT);
  // Update state totals
  try {
    const sp = path.join(__dirname, '../data/state.json');
    let s = JSON.parse(fs.readFileSync(sp,'utf8'));
    s.totalPnl = parseFloat(((s.totalPnl||0) + netPnl).toFixed(4));
    s.totalTrades = (s.totalTrades||0) + 1;
    if (balance.USDT > (s.peakBalance||0)) s.peakBalance = balance.USDT;
    fs.writeFileSync(sp, JSON.stringify(s, null, 2));
  } catch(_) {}
  
  console.log(`   💰 Net P&L: $${netPnl.toFixed(2)} (after $${(entryFee+exitFee).toFixed(2)} fees)`);
}

// ============================================
// PAPER TRADING
// ============================================

async function executePaperTrade(signal) {
  if (signal.direction === 'HOLD' || signal.confidence < 50) {
    console.log(`🤔 ${signal.symbol}: No trade - ${signal.direction} (${signal.confidence}% confidence)`);
    return null;
  }

  try {
    // Position sizing: risk 2% of current balance, max 10% exposure
    const currentBalance = (await getAccountBalance()).USDT;
    const price = signal.entryPrice;
    const riskAmount = currentBalance * (CONFIG.riskPerTrade / 100);
    const slDistance = Math.abs(price - signal.stopLoss);
    const slPct = slDistance / price;
    let qty = slPct > 0 ? (riskAmount / slDistance) : (currentBalance * 0.10 / price);
    const maxExposure = currentBalance * 0.10;
    if (qty * price > maxExposure) qty = maxExposure / price;
    // Round to exchange precision
    if (price < 0.01) qty = Math.floor(qty);
    else if (price < 1) qty = parseFloat(qty.toFixed(0));
    else if (price < 100) qty = parseFloat(qty.toFixed(2));
    else qty = parseFloat(qty.toFixed(4));
    if (qty <= 0) { console.log(`⚠️ ${signal.symbol}: qty=0, skipping`); return null; }
    
    const order = await placeMarketOrder(
      signal.symbol,
      signal.direction === 'LONG' ? 'BUY' : 'SELL',
      qty,
      signal.entryPrice  // Pass expected price for slippage check
    );
    
    // Log to database (omit confidence if column doesn't exist)
    // Only use columns that exist in trades schema
    const tradeData = {
      bot_mode: 'ml-paper',
      symbol: signal.symbol,
      side: signal.direction,
      entry_price: parseFloat(signal.entryPrice.toFixed(6)),
      quantity: parseFloat(qty.toFixed(6)),
      status: 'OPEN',
      stop_loss: parseFloat(signal.stopLoss.toFixed(6)),
      take_profit: parseFloat(signal.takeProfit.toFixed(6)),
    };
    
    // Insert trade (confidence column doesn't exist in schema, use clean data only)
    let { data: trade, error } = await supabase.from('trades').insert(tradeData).select().single();
    
    if (error) console.error('DB Error:', error);
    
    const estFee = signal.entryPrice * signal.positionSize * signal.feeRate;
    const estSlippage = signal.entryPrice * signal.positionSize * SLIPPAGE_CONFIG.tolerancePercent / 100;
    console.log(`✅ ${signal.direction} ${signal.symbol} @ ${signal.entryPrice}`);
    console.log(`   Size: ${signal.positionSize.toFixed(4)} | SL: ${signal.stopLoss.toFixed(2)} | TP: ${signal.takeProfit.toFixed(2)}`);
    console.log(`   Est. Fees: $${estFee.toFixed(2)} (${(signal.feeRate*100).toFixed(2)}%) | Slippage: ${SLIPPAGE_CONFIG.tolerancePercent}%`);
    
    return trade;
  } catch (e) {
    console.error(`❌ Trade failed: ${e.message}`);
    return null;
  }
}

// ============================================
// MAIN TRADING LOOP
// ============================================

async function runTradingBot() {
  console.log('═'.repeat(50));
  console.log('🤖 KVANTEDGE PAPER TRADING BOT v2.2');
  console.log('═'.repeat(50));
  console.log(`📡 Data: BINANCE MAINNET (real prices)`);
  console.log(`💸 Trade: PAPER (simulated, no real orders)`);
  console.log(`🛡️ Exit: SL=${EXIT_CONFIG.stopLossPercent}% | TP=${EXIT_CONFIG.takeProfitPercent}% | MaxHold=${EXIT_CONFIG.maxHoldTimeHours}h`);
  
  const start = Date.now();
  let tradesExecutedCount = 0;
  
  // Get account balance
  const balance = await getAccountBalance();
  console.log(`\n💰 Paper Balance: $${balance.USDT.toFixed(2)}`);
  
  // Get open positions
  const { data: openTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_mode', 'ml-paper')
    .eq('status', 'OPEN');
  
  console.log(`📊 Open Positions: ${openTrades?.length || 0}/${CONFIG.maxOpenPositions}`);
  
  // ============================================
  // STEP 1: CHECK EXITS FIRST (CRITICAL FIX)
  // ============================================
  await checkExits(openTrades);
  
  // Refresh open trades after exit checks
  const { data: updatedTrades } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_mode', 'ml-paper')
    .eq('status', 'OPEN');
  
  // Create set of symbols with open positions
  const openSymbols = new Set(updatedTrades?.map(t => t.symbol) || []);
  
  // ============================================
  // STEP 2: SCAN FOR NEW ENTRIES
  // ============================================
  console.log(`\n🔍 Scanning ${CONFIG.watchlist.length} symbols for entries...\n`);
  
  for (const symbol of CONFIG.watchlist) {
    try {
      // Skip if we already have a position in this symbol
      if (openSymbols.has(symbol)) {
        console.log(`⏭️ ${symbol}: Already have position, skipping`);
        continue;
      }
      
      const signal = await generateSignal(symbol);
      console.log(`${symbol}: ${signal.direction} (${signal.confidence}%) | RSI: ${signal.indicators.rsi.toFixed(1)} | Price: $${signal.entryPrice.toFixed(2)}`);
      
      if (signal.direction !== 'HOLD' && signal.confidence >= 60) {
        // Only trade if we have room for more positions
        if ((updatedTrades?.length || 0) < CONFIG.maxOpenPositions) {
          await executePaperTrade(signal);
          tradesExecutedCount++;
          
          // Refresh open trades count
          const { data: refresh } = await supabase
            .from('trades')
            .select('symbol')
            .eq('bot_mode', 'ml-paper')
            .eq('status', 'OPEN');
          openSymbols.clear();
          refresh?.forEach(t => openSymbols.add(t.symbol));
        }
      }
    } catch (e) {
      console.log(`❌ ${symbol}: Error - ${e.message}`);
    }
  }
  
  console.log(`\n⏱️ Scan complete in ${((Date.now() - start)/1000).toFixed(1)}s`);
  
  // Return activity stats for notification decision
  const activity = {
    tradesExecuted: tradesExecutedCount,
    positionsClosed: 0, // Will be calculated in logPerformance
    errors: 0
  };
  
  // Log performance
  await logPerformance(activity);
}

async function logPerformance(activity) {
  const balance = await getAccountBalance();
  const today = new Date().toISOString().split('T')[0];
  
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .eq('status', 'CLOSED')
    .gte('created_at', today);
  
  const wins = trades?.filter(t => parseFloat(t.pnl) > 0).length || 0;
  const losses = trades?.filter(t => parseFloat(t.pnl) < 0).length || 0;
  const totalPnl = trades?.reduce((s, t) => s + (parseFloat(t.pnl) || 0), 0) || 0;
  const pnlPct = parseFloat(((totalPnl / CONFIG.initialCapital) * 100).toFixed(2));
  
  // FIX: only use columns that exist in schema
  await supabase.from('performance').upsert({
    date: today,
    starting_balance: CONFIG.initialCapital,
    ending_balance: parseFloat(balance.USDT.toFixed(4)),
    daily_pnl: parseFloat(totalPnl.toFixed(4)),
    trades_count: trades?.length || 0,
    wins,
    losses,
  }, { onConflict: 'date' });
  
  console.log(`\n📈 Today's P&L: $${totalPnl.toFixed(2)} (${((totalPnl/CONFIG.initialCapital)*100).toFixed(2)}%)`);
  console.log(`   Trades: ${trades?.length || 0} | Wins: ${wins} | Losses: ${losses}`);
  
  // Return activity stats for notification decision
  activity.positionsClosed = wins + losses;
  return activity;
}
if (require.main === module) {
  runTradingBot()
    .then(async (activity) => {
      // Only send Telegram notification if there's activity (trade executed, position closed, etc.)
      if (activity && (activity.tradesExecuted > 0 || activity.positionsClosed > 0 || activity.errors > 0)) {
        try {
          const bal = await getAccountBalance();
          let msg = `📊 *CryptoEdge* 💰 $${bal.USDT.toFixed(2)}`;
          if (activity.tradesExecuted > 0) msg += `\n✅ ${activity.tradesExecuted} trade(s) opened`;
          if (activity.positionsClosed > 0) msg += `\n🚪 ${activity.positionsClosed} position(s) closed`;
          if (activity.errors > 0) msg += `\n⚠️ ${activity.errors} error(s)`;
          
          await axios.post('https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage', {
            chat_id: '8169173316',
            text: msg,
            parse_mode: 'Markdown'
          });
          console.log('✅ Telegram notification sent');
        } catch(e) { console.log('Telegram:', e.message); }
      } else {
        console.log('🤫 No significant activity - skipping notification');
      }
      process.exit(0);
    })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runTradingBot, generateSignal, executePaperTrade };
