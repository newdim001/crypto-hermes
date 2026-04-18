/**
 * Smart Engine — The Principled Trading Brain
 * Wraps the trading engine with all 7 principles
 * This is the REAL decision maker — calls principles before every action
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// Testnet config
const USE_TESTNET = process.env.BINANCE_TESTNET === 'true';
const TESTNET_API = 'https://testnet.binance.vision';
const LIVE_API = '${BINANCE_API}';
const BINANCE_API = USE_TESTNET ? TESTNET_API : LIVE_API;

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const {
  CONSTITUTION,
  loadBrain, saveBrain,
  assessCapitalRisk,
  getDailyStatus,
  getExitRules,
  learnFromTrade,
  getBrainConfidence,
  getDynamicWeights,
  isSetupBlacklisted,
  getRecoveryMode,
  calculatePrincipledPositionSize,
  generateSelfAssessment,
} = require('./principles');

const lossAnalyzer = require('./loss-analyzer');
const { runShadowLearning } = require('./shadow-learner');
const brainAdvisor = require('./brain-advisor');

// AI Trading Module (DeepSeek)
let aiTrader = null;
const USE_AI_TRADING = process.env.USE_AI_TRADING === 'true' || false;

async function getAITrader() {
  if (!aiTrader && USE_AI_TRADING) {
    try {
      aiTrader = require('../ai/ai-trader.js');
      console.log('🤖 AI Trading Module loaded - DeepSeek powered!');
    } catch (e) {
      console.log('   ⚠️ AI module not available:', e.message);
    }
  }
  return aiTrader;
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const STATE_FILE = path.join(__dirname, '../../data/state.json');
const BRAIN_FILE = path.join(__dirname, '../../data/brain.json');

// ============================================
// STATE HELPERS
// ============================================
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch(_) { return { balance: 10000, peakBalance: 10000, totalTrades: 0, totalPnl: 0 }; }
}

function saveState(updates) {
  const state = loadState();
  const newState = { ...state, ...updates, lastSaved: Date.now() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));
  return newState;
}

function getBalance() {
  return loadState().balance || 10000;
}

function updateBalance(newBalance, pnl) {
  const state = loadState();
  const peak = Math.max(state.peakBalance || newBalance, newBalance);
  saveState({
    balance: parseFloat(newBalance.toFixed(4)),
    peakBalance: peak,
    totalPnl: parseFloat(((state.totalPnl || 0) + pnl).toFixed(4)),
    totalTrades: (state.totalTrades || 0) + 1,
  });
}

async function getPrice(symbol) {
  try {
    const r = await axios.get(`${BINANCE_API}`);
    return parseFloat(r.data.price);
  } catch(e) {
    console.error(`Price fetch error ${symbol}:`, e.message);
    return null;
  }
}

async function getCandles(symbol, interval = '1h', limit = 100) {
  try {
    const r = await axios.get(`${BINANCE_API}/api/v3/klines`, {
      params: { symbol, interval, limit }
    });
    return r.data.map(k => ({
      time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
    }));
  } catch(e) {
    console.error(`Candles fetch error ${symbol}:`, e.message);
    return null;
  }
}

// ============================================
// INDICATOR CALCULATIONS
// ============================================
function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const ch = candles[i].close - candles[i-1].close;
    if (ch > 0) gains += ch; else losses -= ch;
  }
  const rs = losses === 0 ? 100 : (gains/period) / (losses/period);
  return 100 - (100 / (1 + rs));
}

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1-k);
  return ema;
}

function calcMACD(candles) {
  const ema12 = calcEMA(candles, 12);
  const ema26 = calcEMA(candles, 26);
  return { line: ema12 - ema26, histogram: ema12 - ema26 };
}

function calcVolRatio(candles, period = 20) {
  const recent = candles[candles.length-1].volume;
  const avg = candles.slice(-period-1,-1).reduce((s,c) => s+c.volume, 0) / period;
  return avg > 0 ? recent / avg : 1;
}

function calc1DTrend(candles) {
  const ema9 = calcEMA(candles, 9);
  const ema21 = calcEMA(candles, 21);
  return ema9 > ema21 ? 'BULLISH' : 'BEARISH';
}

// ============================================
// NEW ENHANCED INDICATORS
// ============================================

// ATR - Average True Range (volatility)
function calcATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  let trSum = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i-1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

// VWAP - Volume Weighted Average Price
function calcVWAP(candles) {
  let cumVolPrice = 0, cumVol = 0;
  for (let i = candles.length - 24; i < candles.length; i++) {
    const typicalPrice = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumVolPrice += typicalPrice * candles[i].volume;
    cumVol += candles[i].volume;
  }
  return cumVol > 0 ? cumVolPrice / cumVol : candles[candles.length-1].close;
}

// CCI - Commodity Channel Index
function calcCCI(candles, period = 20) {
  if (candles.length < period) return 0;
  const recent = candles.slice(-period);
  const tp = recent.map(c => (c.high + c.low + c.close) / 3);
  const sma = tp.reduce((a,b) => a+b, 0) / period;
  const meanDev = tp.reduce((a,b) => a + Math.abs(b - sma), 0) / period;
  const cci = (tp[tp.length-1] - sma) / (0.015 * meanDev);
  return cci;
}

// Williams %R
function calcWilliamsR(candles, period = 14) {
  if (candles.length < period) return -50;
  const recent = candles.slice(-period);
  const highest = Math.max(...recent.map(c => c.high));
  const lowest = Math.min(...recent.map(c => c.low));
  const close = candles[candles.length-1].close;
  return ((highest - close) / (highest - lowest)) * -100;
}

// OBV - On Balance Volume
function calcOBV(candles) {
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i-1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i-1].close) obv -= candles[i].volume;
  }
  return obv;
}

// MFI - Money Flow Index
function calcMFI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let posFlow = 0, negFlow = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    const mf = tp * candles[i].volume;
    const prevTp = (candles[i-1].high + candles[i-1].low + candles[i-1].close) / 3;
    if (tp > prevTp) posFlow += mf; else negFlow += mf;
  }
  return negFlow === 0 ? 100 : 100 - (100 / (1 + posFlow / negFlow));
}

// ROC - Rate of Change
function calcROC(candles, period = 12) {
  if (candles.length < period) return 0;
  const current = candles[candles.length-1].close;
  const past = candles[candles.length-period].close;
  return ((current - past) / past) * 100;
}

// SAR - Stop and Reverse
function calcSAR(candles) {
  const accel = 0.02, maxAccel = 0.2;
  let sar = candles[0].low, trend = 'BULLISH', ep = candles[0].high, af = accel;
  for (let i = 1; i < candles.length; i++) {
    const prevSar = sar;
    sar = prevSar + af * (ep - prevSar);
    if (trend === 'BULLISH') {
      if (candles[i].low < sar) { trend = 'BEARISH'; sar = ep; ep = candles[i].low; af = accel; }
      else { if (candles[i].high > ep) { ep = candles[i].high; af = Math.min(af + accel, maxAccel); } }
    } else {
      if (candles[i].high > sar) { trend = 'BULLISH'; sar = ep; ep = candles[i].high; af = accel; }
      else { if (candles[i].low < ep) { ep = candles[i].low; af = Math.min(af + accel, maxAccel); } }
    }
  }
  return { sar, direction: trend };
}

// Time-based features
function calcTimeFeatures() {
  const now = new Date(), hour = now.getUTCHours(), dayOfWeek = now.getUTCDay();
  const bestHours = [16, 17, 18, 19, 20];
  return { hour, dayOfWeek, hourScore: bestHours.includes(hour) ? 30 : -10, dayScore: (dayOfWeek === 0 || dayOfWeek === 6) ? -20 : 20 };
}

// Market regime detection
function calcRegime(candles) {
  const atr = calcATR(candles);
  const avgPrice = candles.slice(-20).reduce((s,c) => s + c.close, 0) / 20;
  const atrPercent = (atr / avgPrice) * 100;
  const ema20 = calcEMA(candles, 20);
  const price = candles[candles.length-1].close;
  if (atrPercent > 2.5) return 'VOLATILE';
  if (Math.abs(price - ema20) / ema20 < 0.02) return 'RANGING';
  return 'TRENDING';
}

// ============================================
// PRINCIPLED SIGNAL GENERATOR (ENHANCED)
// ============================================
async function generatePrincipledSignal(symbol, brain) {
  const candles = await getCandles(symbol, '1h', 100);
  if (!candles || candles.length < 50) return null;

  const weights = getDynamicWeights(brain);
  
  // Core indicators
  const rsi = calcRSI(candles);
  const ema9 = calcEMA(candles, 9);
  const ema21 = calcEMA(candles, 21);
  const macd = calcMACD(candles);
  const volRatio = calcVolRatio(candles);
  const trend = calc1DTrend(candles);
  const currentPrice = candles[candles.length-1].close;
  
  // NEW Enhanced indicators
  const atr = calcATR(candles);
  const vwap = calcVWAP(candles);
  const cci = calcCCI(candles);
  const williamsR = calcWilliamsR(candles);
  const obv = calcOBV(candles);
  const mfi = calcMFI(candles);
  const roc = calcROC(candles);
  const sar = calcSAR(candles);
  const timeFeatures = calcTimeFeatures();
  const regime = calcRegime(candles);

  // Score each indicator independently (ENHANCED)
  const scores = {
    rsi: rsi < 30 ? 80 : rsi > 70 ? -80 : (50 - rsi) * 1.5,
    macd: macd.histogram > 0 ? 60 : -60,
    ema: ema9 > ema21 ? 70 : -70,
    volume: volRatio > 1.2 ? 40 : volRatio < 0.8 ? -30 : 0,
    trend: trend === 'BULLISH' ? 50 : -50,
    // NEW indicator scores
    atr: (atr / currentPrice) * 100 > 2 ? -20 : 20, // High volatility = risky
    cci: cci < -100 ? 60 : cci > 100 ? -60 : 0, // Oversold/overbought
    williamsR: williamsR < -80 ? 60 : williamsR > -20 ? -60 : 0,
    mfi: mfi < 20 ? 60 : mfi > 80 ? -60 : 0, // Money flow
    roc: roc > 2 ? 40 : roc < -2 ? -40 : 0, // Rate of change
    sar: sar.direction === 'BULLISH' ? 40 : -40,
    hour: timeFeatures.hourScore,
    day: timeFeatures.dayScore,
    regime: regime === 'RANGING' ? 20 : regime === 'TRENDING' ? 30 : -20
  };

  // Apply dynamic brain weights (now including new indicators)
  let totalScore = 0;
  let totalWeight = 0;
  for (const [key, score] of Object.entries(scores)) {
    const w = weights[key] || 20;
    totalScore += score * w;
    totalWeight += w;
  }
  const normalizedScore = totalWeight > 0 ? totalScore / totalWeight : 0;

  // Require STRONG signal (higher threshold = no greed, no noise)
  let direction = 'HOLD';
  let confidence = 0;

  if (normalizedScore > 25 && trend === 'BULLISH') {
    direction = 'LONG';
    confidence = Math.min(90, Math.abs(normalizedScore) + 20);
  } else if (normalizedScore < -25 && trend === 'BEARISH') {
    direction = 'SHORT';
    confidence = Math.min(90, Math.abs(normalizedScore) + 20);
  }

  // PRINCIPLE: Volume must confirm (no low-volume trades)
  if (volRatio < 0.8 && direction !== 'HOLD') {
    console.log(`   ⚠️ ${symbol}: Low volume (${volRatio.toFixed(2)}x) — skipping`);
    direction = 'HOLD';
    confidence = 0;
  }

  // PRINCIPLE: Time filtering
  if (timeFeatures.hourScore < 0 && direction !== 'HOLD') {
    console.log(`   ⚠️ ${symbol}: Off-hours (${timeFeatures.hour}) — skipping`);
    direction = 'HOLD';
    confidence = 0;
  }

  // PRINCIPLE: HTF trend alignment required
  if (direction === 'LONG' && trend === 'BEARISH') {
    confidence = Math.round(confidence * 0.3);
    if (confidence < CONSTITUTION.MIN_CONFIDENCE) direction = 'HOLD';
  }
  if (direction === 'SHORT' && trend === 'BULLISH') {
    confidence = Math.round(confidence * 0.3);
    if (confidence < CONSTITUTION.MIN_CONFIDENCE) direction = 'HOLD';
  }

  return {
    symbol, direction, confidence, currentPrice,
    indicators: { rsi, ema9, ema21, macd: macd.histogram, volRatio, trend, atr, vwap, cci, williamsR, mfi, roc, regime, ...timeFeatures },
    scores, normalizedScore,
    indicatorsSnapshot: {
      rsiSignal: scores.rsi > 30 ? 'triggered' : 'neutral',
      macdSignal: scores.macd > 0 ? 'triggered' : 'neutral',
      emaSignal: scores.ema > 0 ? 'triggered' : 'neutral',
      cciSignal: Math.abs(scores.cci) > 0 ? 'triggered' : 'neutral',
      williamsRSignal: Math.abs(scores.williamsR) > 0 ? 'triggered' : 'neutral',
      mfiSignal: Math.abs(scores.mfi) > 0 ? 'triggered' : 'neutral',
      regime,
      setup: `${trend}_${rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'}_${volRatio > 1.2 ? 'HIGH_VOL' : 'LOW_VOL'}_${regime}`,
    }
  };
}

// ============================================
// PRINCIPLED EXIT CHECKER
// ============================================
async function checkPrincipledExits(brain) {
  const { data: openTrades } = await supabase
    .from('trades').select('*').eq('status', 'OPEN');
  
  if (!openTrades || openTrades.length === 0) {
    console.log('📭 No open positions');
    return 0;
  }

  console.log(`\n🔄 Checking ${openTrades.length} positions for exits...`);
  let exited = 0;
  let balance = getBalance();

  for (const trade of openTrades) {
    const currentPrice = await getPrice(trade.symbol);
    if (!currentPrice) continue;

    const direction = trade.side;
    const entryPrice = parseFloat(trade.entry_price);
    const sl = parseFloat(trade.stop_loss);
    const tp = parseFloat(trade.take_profit);
    const qty = parseFloat(trade.quantity);
    const pnl = direction === 'LONG' 
      ? (currentPrice - entryPrice) * qty
      : (entryPrice - currentPrice) * qty;
    const pnlPct = (pnl / (entryPrice * qty)) * 100;

    // Check hold time
    const hoursHeld = (Date.now() - new Date(trade.created_at).getTime()) / 3600000;

    // TRAILING STOP — once in profit, protect gains
    let effectiveSL = sl;
    if (pnlPct >= CONSTITUTION.TRAILING_STOP_ACTIVATION_PCT) {
      const trailDistance = currentPrice * (CONSTITUTION.TRAILING_STOP_DISTANCE_PCT / 100);
      if (direction === 'LONG') {
        effectiveSL = Math.max(sl, currentPrice - trailDistance);
      } else {
        effectiveSL = Math.min(sl, currentPrice + trailDistance);
      }
      if (effectiveSL !== sl) console.log(`   🎯 ${trade.symbol}: Trailing stop moved to ${effectiveSL.toFixed(4)}`);
    }

    // Exit conditions
    const slHit = direction === 'LONG' ? currentPrice <= effectiveSL : currentPrice >= effectiveSL;
    const tpHit = direction === 'LONG' ? currentPrice >= tp : currentPrice <= tp;
    
    // SMART EXTENSION LOGIC: Allow extension if in profit
    const maxHours = pnlPct >= CONSTITUTION.HOLD_EXTENSION_PROFIT_PCT 
      ? CONSTITUTION.HOLD_EXTENSION_MAX_HOURS 
      : CONSTITUTION.MAX_HOLD_HOURS;
    const timeOut = hoursHeld >= maxHours;
    
    // During extension: tighter trailing stop
    if (hoursHeld > CONSTITUTION.MAX_HOLD_HOURS && pnlPct > 0) {
      const extTrailDistance = currentPrice * (CONSTITUTION.HOLD_EXTENSION_TRAIL_PCT / 100);
      if (direction === 'LONG') {
        effectiveSL = Math.max(effectiveSL, currentPrice - extTrailDistance);
      } else {
        effectiveSL = Math.min(effectiveSL, currentPrice + extTrailDistance);
      }
      console.log(`   ⏳ ${trade.symbol}: Extended hold - tighter trailing at ${effectiveSL.toFixed(4)}`);
    }

    let exitReason = null;
    if (slHit) exitReason = 'STOP_LOSS';
    else if (tpHit) exitReason = 'TAKE_PROFIT';
    else if (timeOut) {
      exitReason = pnlPct > 0 ? 'TIME_MAX_PROFIT' : 'MAX_HOLD_TIME';
    }

    if (exitReason) {
      // NET profit = gross PnL - entry fee - exit fee (both legs, 0.1% each)
      const entryFee = parseFloat(trade.entry_price) * parseFloat(trade.quantity) * CONSTITUTION.BINANCE_TAKER_FEE;
      const exitFee  = currentPrice * parseFloat(trade.quantity) * CONSTITUTION.BINANCE_TAKER_FEE;
      const totalFees = entryFee + exitFee;
      const netPnl = pnl - totalFees;
      console.log(`   💸 Fees: $${totalFees.toFixed(4)} (entry $${entryFee.toFixed(4)} + exit $${exitFee.toFixed(4)})`);
      
      // Update trade in DB
      await supabase.from('trades').update({
        status: 'CLOSED',
        exit_price: parseFloat(currentPrice.toFixed(6)),
        pnl: parseFloat(netPnl.toFixed(4)),
      }).eq('id', trade.id);

      // Update balance
      balance += netPnl;
      updateBalance(balance, netPnl);

      // PRINCIPLE 4: Learn from this trade
      const closedTrade = { ...trade, exit_price: currentPrice, pnl: netPnl };
      learnFromTrade(closedTrade, brain);

      // If it's a loss, run full loss analysis
      if (netPnl < 0) {
        const lossAnalysis = lossAnalyzer.analyze(closedTrade);
        console.log(`   🔍 Loss Analysis: ${lossAnalysis.rootCause.join(', ')}`);
        console.log(`   📚 Prevention: ${lossAnalysis.preventionRule}`);
        
        // Apply weight adjustments from loss analysis
        if (lossAnalysis.weightAdjustment) {
          for (const [ind, adj] of Object.entries(lossAnalysis.weightAdjustment)) {
            brain.weights[ind] = Math.max(10, Math.min(100, (brain.weights[ind] || 50) + adj));
          }
        }
      }

      const icon = netPnl > 0 ? '✅' : '❌';
      console.log(`${icon} EXIT ${trade.symbol}: ${exitReason} | P&L: $${netPnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`);

      // Telegram notification
      await notifyTelegram(`${icon} *${exitReason}*\n${trade.symbol} ${trade.side}\nP&L: $${netPnl.toFixed(2)} (${pnlPct.toFixed(2)}%)\nBalance: $${balance.toFixed(2)}`);

      exited++;
    } else {
      const icon = pnl > 0 ? '📈' : '📉';
      console.log(`${icon} ${trade.symbol} HOLD | ${pnlPct.toFixed(2)}% | ${hoursHeld.toFixed(1)}h`);
    }
  }

  return exited;
}

// ============================================
// PRINCIPLED ENTRY LOGIC
// ============================================
async function scanForEntries(brain, dailyStatus, capitalRisk) {
  // PRINCIPLE 1: Capital protection - T3 HALT blocks everything
  if (capitalRisk.action === 'HALT') {
    console.log(capitalRisk.message);
    return 0;
  }

  // T2 allows reduced trading (25% size) for recovery
  // T1 allows 50% trading
  // Normal allows 100% trading
  if (capitalRisk.tier >= 1) {
    console.log(capitalRisk.message);
  }

  // PRINCIPLE 2 & 3: Zone-aware entry control
  if (dailyStatus.lossLimitHit) {
    console.log('🔴 Daily loss limit hit — no new trades today');
    return 0;
  }
  if (dailyStatus.zone === 'STOP') {
    console.log('🎯 Daily stop zone (>1%) — profits locked, no new trades');
    return 0;
  }
  if (dailyStatus.tradeCapHit) {
    console.log('⏰ Daily trade cap reached — no new trades today');
    return 0;
  }
  // Log current zone
  const zoneIcon = {'BELOW_SAFE':'🟢','SAFE':'🟡','LEVERAGE':'🟠','STOP':'🔴'}[dailyStatus.zone] || '⚪';
  console.log(`${zoneIcon} Zone: ${dailyStatus.zone} | Day P&L: $${dailyStatus.currentDayPnl.toFixed(2)} | Target: $${dailyStatus.safeZone.toFixed(2)}-$${dailyStatus.levZone.toFixed(2)}`);

  // Get current open positions
  const { data: openPositions } = await supabase
    .from('trades').select('symbol').eq('status', 'OPEN');
  const openSymbols = new Set((openPositions || []).map(p => p.symbol));
  const openCount = openSymbols.size;

  if (openCount >= CONSTITUTION.MAX_OPEN_POSITIONS) {
    console.log(`📊 Max positions (${openCount}/${CONSTITUTION.MAX_OPEN_POSITIONS}) — no new entries`);
    return 0;
  }

  // Check daily trade limit - STRICT quality control
  const todayTrades = brain.todayTrades || 0;
  const todayDate = new Date().toISOString().split('T')[0];
  if (brain.todayDate !== todayDate) {
    brain.todayTrades = 0;
    brain.todayDate = todayDate;
    brain.todayPnl = 0;
    saveBrain(brain);
  }
  
  if (todayTrades >= CONSTITUTION.DAILY_MAX_TRADES) {
    console.log(`⏸️ DAILY LIMIT REACHED: ${todayTrades}/${CONSTITUTION.DAILY_MAX_TRADES} trades today — waiting for tomorrow`);
    return 0;
  }

  const balance = getBalance();
  // MASTERED WATCHLIST - BTC & ETH only
  // Altcoins are too volatile - we master these two over time
  const watchlist = ['BTCUSDT', 'ETHUSDT'];
  
  // But apply symbol-specific confidence based on learning
  const accuracy = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/signal-accuracy.json'), 'utf8')); } 
    catch(_) { return null; }
  })();
  
  if (accuracy?.bySymbol) {
    console.log(`   📊 BTC accuracy: ${accuracy.bySymbol.BTCUSDT?.accuracy || 'N/A'}% | ETH: ${accuracy.bySymbol.ETHUSDT?.accuracy || 'N/A'}%`);
  }
  let entered = 0;

  // ============================================
  // AI TRADING ANALYSIS (DeepSeek)
  // ============================================
  if (USE_AI_TRADING) {
    const aiModule = await getAITrader();
    if (aiModule) {
      console.log(`\n🤖 AI ANALYSIS: Getting DeepSeek signals for ${watchlist}...`);
      try {
        const aiSignals = await aiModule.analyzeWithAI(watchlist);
        console.log(`📊 AI found ${aiSignals.length} trading opportunities`);
        
        // Execute AI signals
        for (const aiSignal of aiSignals) {
          if (openSymbols.has(aiSignal.symbol)) continue;
          if (openCount + entered >= CONSTITUTION.MAX_OPEN_POSITIONS) break;
          
          console.log(`   🤖 AI Signal: ${aiSignal.symbol} ${aiSignal.direction} (${aiSignal.confidence}%)`);
          console.log(`   📝 Reason: ${aiSignal.reason}`);
          
          if (aiSignal.confidence >= 60 && (aiSignal.direction === 'LONG' || aiSignal.direction === 'SHORT')) {
            const aiPrice = aiSignal.entry === 'current' ? (await aiModule.getMarketData(aiSignal.symbol)).price : aiSignal.entry;
            const side = aiSignal.direction === 'LONG' ? 'BUY' : 'SELL';
            const qty = calculatePrincipledPositionSize(balance, aiPrice, aiSignal.stopLoss || aiPrice * 0.985, capitalRisk);
            
            if (qty > 0) {
              const trade = await executeTrade(aiSignal.symbol, side, qty, aiPrice, {
                stopLoss: aiSignal.stopLoss || aiPrice * 0.985,
                takeProfit: aiSignal.takeProfit || aiPrice * 1.03,
                source: 'AI_DEEPSEEK',
                aiConfidence: aiSignal.confidence,
                aiReason: aiSignal.reason
              });
              
              if (trade) {
                console.log(`   ✅ AI Trade executed: ${aiSignal.symbol} ${side} ${qty} @ $${aiPrice}`);
                entered++;
              }
            }
          }
        }
      } catch (e) {
        console.log(`   ⚠️ AI analysis error: ${e.message}`);
      }
    }
  }

  // ============================================
  // FALLBACK: Traditional indicator-based scanning
  // ============================================
  if (!USE_AI_TRADING || entered === 0) {
    console.log(`\n🔍 Scanning ${watchlist.length} symbols (traditional)...`);
  }

  for (const symbol of watchlist) {
    if (openSymbols.has(symbol)) { console.log(`⏭️ ${symbol}: Position open`); continue; }
    if (openCount + entered >= CONSTITUTION.MAX_OPEN_POSITIONS) break;

    const signal = await generatePrincipledSignal(symbol, brain);
    if (!signal) continue;

    const { direction, confidence, currentPrice, indicators } = signal;

    console.log(`${symbol}: ${direction} (${confidence}%) | RSI:${indicators.rsi.toFixed(1)} | Vol:${indicators.volRatio.toFixed(2)}x | Trend:${indicators.trend}`);

    // PRINCIPLE 3 + SHADOW LEARNING: Zone-aware + shadow-adjusted confidence
    let requiredConfidence = CONSTITUTION.MIN_CONFIDENCE; // 60% default
    if (dailyStatus.zone === 'SAFE')     requiredConfidence = 70;
    if (dailyStatus.zone === 'LEVERAGE') requiredConfidence = CONSTITUTION.OPPORTUNITY_MIN_CONFIDENCE;

    if (direction === 'HOLD') continue;

    // Brain Advisor: shadow-learning-adjusted confidence (smarter gate)
    const indicatorsFired = Object.entries(signal.indicatorsSnapshot || {})
      .filter(([,v]) => v === 'triggered').map(([k]) => k.replace('Signal',''));
    const regime = signal.indicators?.trend === 'BULLISH' ? 'TRENDING' : 'RANGING';
    const trustCheck = brainAdvisor.shouldTrustSignal(symbol, direction, confidence, regime, indicatorsFired);
    const smartConf  = trustCheck.confidence;

    if (!trustCheck.trust || smartConf < requiredConfidence) {
      console.log(`   ⏭️ ${symbol}: ${trustCheck.reason || (smartConf + '% < ' + requiredConfidence + '% required')}`);
      if (trustCheck.adjustments?.length) console.log(`      Shadow adj: ${trustCheck.adjustments.join(', ')}`);
      continue;
    }
    if (trustCheck.adjustments?.length) {
      console.log(`   🧠 ${symbol}: Smart conf ${smartConf}% (raw:${confidence}%) | ${trustCheck.adjustments.join(', ')}`);
    }

    // PRINCIPLE 5: Recovery mode instead of blacklisting
    // After 3 consecutive losses, we use reduced size + tighter confidence for 3 trades
    const recovery = getRecoveryMode(symbol, direction, brain);
    if (recovery) {
      console.log(`   🔄 ${symbol} ${direction} in RECOVERY mode — ${recovery.tradesRemaining} trades left, size ${recovery.sizeMultiplier*100}%, need +${recovery.confidenceBoost}% conf`);
      adjustedConf = (adjustedConf || confidence) + recovery.confidenceBoost;
      // Decrement recovery trades after using it
      const key = `${symbol}_${direction}`;
      if (brain.recoveryMode && brain.recoveryMode[key]) {
        brain.recoveryMode[key].tradesRemaining--;
      }
      saveBrain(brain);
    }
    
    // Skip if confidence still not met even after recovery boost
    if ((adjustedConf || confidence) < CONSTITUTION.MIN_CONFIDENCE) {
      console.log(`   ⚠️ ${symbol} ${direction} confidence ${(adjustedConf || confidence)}% below minimum ${CONSTITUTION.MIN_CONFIDENCE}% — skipped`);
      continue;
    }

    // PRINCIPLE 3: No-greed exit rules
    const exits = getExitRules(direction, currentPrice, brain);
    const rr = exits.tpPct / exits.slPct;
    if (rr < CONSTITUTION.MIN_RISK_REWARD) {
      console.log(`   ⚠️ R:R ${rr.toFixed(1)} below minimum ${CONSTITUTION.MIN_RISK_REWARD} — skipped`);
      continue;
    }

    // PRINCIPLE 1: Principled position size (with recovery mode multiplier if active)
    const baseQty = calculatePrincipledPositionSize(balance, currentPrice, exits.stopLoss, capitalRisk);
    const recoveryMultiplier = recovery ? recovery.sizeMultiplier : 1.0;
    const qty = baseQty * recoveryMultiplier;
    if (qty <= 0) { console.log(`   ⚠️ Position size = 0 (recovery mult: ${recoveryMultiplier}) — skipped`); continue; }

    const exposure = qty * currentPrice;
    const exposurePct = (exposure / balance * 100).toFixed(1);

    // Place trade
    const tradeData = {
      bot_mode: 'ml-paper',
      symbol,
      side: direction,
      entry_price: parseFloat(currentPrice.toFixed(6)),
      quantity: parseFloat(qty.toFixed(6)),
      status: 'OPEN',
      stop_loss: parseFloat(exits.stopLoss.toFixed(6)),
      take_profit: parseFloat(exits.takeProfit.toFixed(6)),
    };

    const { data: trade, error } = await supabase.from('trades').insert(tradeData).select().single();

    if (error) {
      console.error(`   ❌ DB error: ${error.message}`);
      continue;
    }

    // Update daily counter
    brain.todayTrades = (brain.todayTrades || 0) + 1;

    console.log(`✅ ENTERED: ${direction} ${symbol} @ $${currentPrice.toFixed(4)}`);
    console.log(`   Size: ${qty} | Exposure: $${exposure.toFixed(2)} (${exposurePct}% of account)`);
    console.log(`   SL: $${exits.stopLoss.toFixed(4)} (-${exits.slPct}%) | TP: $${exits.takeProfit.toFixed(4)} (+${exits.tpPct}%) | R:R 1:${rr.toFixed(1)}`);

    await notifyTelegram(`📊 *NEW TRADE*\n${direction} ${symbol} @ $${currentPrice.toFixed(4)}\nSL: $${exits.stopLoss.toFixed(4)} | TP: $${exits.takeProfit.toFixed(4)}\nR:R 1:${rr.toFixed(1)} | Size: $${exposure.toFixed(0)} (${exposurePct}%)`);

    openSymbols.add(symbol);
    entered++;
  }

  return entered;
}

// ============================================
// TELEGRAM NOTIFICATIONS
// ============================================
async function notifyTelegram(message) {
  try {
    await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN || '8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU'}/sendMessage`, {
      chat_id: process.env.TELEGRAM_ADMIN_CHAT || '8169173316',
      text: message,
      parse_mode: 'Markdown'
    });
  } catch(e) { console.log('Telegram:', e.message); }
}

// ============================================
// MAIN LOOP — THE AUTONOMOUS AGENT
// ============================================
async function runSmartEngine() {
  console.log('\n' + '═'.repeat(55));
  console.log('🧠 CRYPTOEDGE SMART ENGINE — PRINCIPLED AI TRADER');
  console.log('═'.repeat(55));
  console.log(`📅 ${new Date().toISOString()}`);

  const brain = loadBrain();
  const balance = getBalance();
  const capitalRisk = assessCapitalRisk(balance);
  const dailyStatus = getDailyStatus(brain, balance);
  const brainConf = getBrainConfidence(brain);

  console.log(`\n💰 Balance: $${balance.toFixed(2)} | Peak: $${(loadState().peakBalance||balance).toFixed(2)}`);
  console.log(`🛡️ Capital: ${capitalRisk.message}`);
  const zoneIcon = {'BELOW_SAFE':'🟢','SAFE':'🟡','LEVERAGE':'🟠','STOP':'🔴'}[dailyStatus.zone]||'⚪';
  const weeklyProgress = ((loadState().totalPnl || 0) / (getBalance() * CONSTITUTION.WEEKLY_TARGET_PCT / 100) * 100).toFixed(0);
  console.log(`📅 Zone: ${zoneIcon}${dailyStatus.zone} | Day P&L: $${dailyStatus.currentDayPnl.toFixed(2)} | Safe:$${dailyStatus.safeZone.toFixed(2)} Lev:$${dailyStatus.levZone.toFixed(2)}`);
  console.log(`📆 Weekly: ${weeklyProgress}% to 5% target | Trades today: ${brain.todayTrades||0}/${CONSTITUTION.DAILY_MAX_TRADES}`);
  console.log(`🧠 Brain: ${brainConf}% confidence | Consecutive losses: ${brain.consecutiveLosses}`);
  console.log(`⚖️ Weights: RSI:${brain.weights.rsi} MACD:${brain.weights.macd} EMA:${brain.weights.ema} Vol:${brain.weights.volume}`);

  // STEP 1: Check and manage exits
  console.log('\n── STEP 1: EXIT CHECK ──');
  const exited = await checkPrincipledExits(brain);

  // STEP 2: Scan for entries
  console.log('\n── STEP 2: ENTRY SCAN ──');
  const entered = await scanForEntries(brain, dailyStatus, capitalRisk);

  // STEP 3: Save updated brain
  saveBrain(brain);

  // STEP 4: Self-assessment
  const updatedBalance = getBalance();
  const assessment = generateSelfAssessment(brain, updatedBalance);
  console.log(`\n── STEP 3: SELF ASSESSMENT ──`);
  console.log(`💡 ${assessment.recommendation}`);
  if (brain.blacklistedSetups.length > 0) {
    console.log(`🚫 Blacklisted: ${brain.blacklistedSetups.join(', ')}`);
  }

  // STEP 5: Periodic full report (every 6 hours)
  const lastReport = brain.lastFullReport || 0;
  if (Date.now() - lastReport > 6 * 60 * 60 * 1000) {
    const report = generateSelfAssessment(brain, updatedBalance);
    const lossPatterns = lossAnalyzer.findLossPatterns(brain.lossPatterns || []);
    

    const learningDigest = brainAdvisor.getLearningDigest();
    const tradingWindow  = brainAdvisor.getBestTradingWindow();
    const symbolBias     = brainAdvisor.getSymbolBias();
    const topSymbols     = Object.entries(symbolBias)
      .filter(([,v]) => v.multiplier > 1 && v.dataPoints >= 5)
      .sort(([,a],[,b]) => b.accuracy - a.accuracy)
      .slice(0,3)
      .map(([s,v]) => `${s}(${v.accuracy}%)`);

    let reportMsg = `📊 *6-Hour Report*\n`;
    reportMsg += `💰 Balance: $${updatedBalance.toFixed(2)}\n`;
    reportMsg += `🧠 Brain: ${brainConf}% confidence\n`;
    reportMsg += `📈 Win rate: ${report.winRate}\n`;
    reportMsg += `📅 Today P&L: $${report.todayPnl}\n`;
    reportMsg += `💡 ${report.recommendation}\n`;
    reportMsg += `\n${learningDigest}\n`;
    reportMsg += `⏰ ${tradingWindow.recommendation}`;
    if (topSymbols.length > 0) reportMsg += `\n🎯 Shadow-preferred: ${topSymbols.join(', ')}`;
    if (lossPatterns.recommendation?.length > 0) {
      reportMsg += `\n🔍 ${lossPatterns.recommendation.join('; ')}`;
    }
    
    await notifyTelegram(reportMsg);
    brain.lastFullReport = Date.now();
    saveBrain(brain);
  }

  // STEP 4: Weight Recalibration - align brain with shadow learning EVERY cycle
  console.log('\n── STEP 4: WEIGHT RECALIBRATION ──');
  try {
    brainAdvisor.recalibrateWeights(brain);
    console.log('   ✅ Weights aligned with shadow accuracy');
  } catch(e) {
    console.log('   ⚠️ Weight recalibration:', e.message);
  }

  // STEP 5: Shadow learning — learn from live price action even when not trading
  console.log('\n── STEP 5: SHADOW LEARNING ──');
  try {
    const WATCHLIST = ['BTCUSDT','ETHUSDT']; // Only BTC & ETH for safety
    const shadowResult = await runShadowLearning(WATCHLIST);
    if (shadowResult.report) {
      console.log(`  📊 Accuracy: ${shadowResult.report.overallAccuracy} | Best: ${shadowResult.report.bestIndicator}`);
    }
  } catch(e) { console.log('  Shadow learning error:', e.message); }

  console.log(`\n✅ Cycle complete: ${exited} exited, ${entered} entered`);
  return { exited, entered, balance: updatedBalance };
}

// Run if called directly
if (require.main === module) {
  runSmartEngine()
    .then(r => { console.log('\nDone:', r); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runSmartEngine, generatePrincipledSignal };
