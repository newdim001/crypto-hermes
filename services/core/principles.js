/**
 * CryptoEdge Trading Principles — The Constitution
 * 
 * PRINCIPLE 1: Protect capital above all else
 * PRINCIPLE 2: Make reasonable daily profit (0.5% target)
 * PRINCIPLE 3: No greed — exit at target, never move goalposts
 * PRINCIPLE 4: Learn from every trade — wins AND losses
 * PRINCIPLE 5: Become smarter every day — dynamic adaptation
 * PRINCIPLE 6: Autonomous duty — show profit to Suren
 * PRINCIPLE 7: Ultimate goal — PROFITS
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../data/state.json');
const BRAIN_FILE = path.join(__dirname, '../../data/brain.json');

// ============================================
// THE CONSTITUTION — HARD RULES (NEVER BREAK)
// ============================================
const CONSTITUTION = {
  // Capital Protection
  MAX_RISK_PER_TRADE_PCT: 1.0,      // Never risk more than 1% per trade
  MAX_POSITION_EXPOSURE_PCT: 5.0,   // Max 5% of account per position
  MAX_OPEN_POSITIONS: 3,            // Max 3 simultaneous
  
  // Daily Profit Zones (NET after all Binance fees)
  DAILY_SAFE_ZONE_PCT: 0.5,         // 0.5% = safe zone reached, reduce aggression
  DAILY_LEVERAGE_ZONE_PCT: 0.75,    // 0.75% = leverage zone, only A+ setups allowed
  DAILY_STOP_PCT: 1.0,              // 1.0% = close shop, lock profits
  DAILY_LOSS_LIMIT_PCT: 2.0,        // Hard stop at 2% daily loss
  DAILY_MAX_TRADES: 6,              // No overtrading

  // Weekly Target
  WEEKLY_TARGET_PCT: 5.0,           // 5% per week = ~0.7%/day average needed
  
  // Fee Configuration (Binance spot - all P&L is NET)
  BINANCE_TAKER_FEE: 0.001,         // 0.1% taker fee
  BINANCE_MAKER_FEE: 0.001,         // 0.1% maker fee
  // Net profit = gross PnL - entry fee - exit fee (both legs always deducted)
  
  // Opportunity Capture (AI confidence override)
  // Even in safe/leverage zone, take trade if confidence is exceptional
  OPPORTUNITY_MIN_CONFIDENCE: 75,   // >= 75% confidence = A+ opportunity, always take (from 85)
  
  // Drawdown Tiers (capital protection escalation)
  TIER1_DRAWDOWN_PCT: 5.0,          // Reduce size 50%
  TIER2_DRAWDOWN_PCT: 10.0,         // Stop new trades
  TIER3_DRAWDOWN_PCT: 15.0,         // Full kill switch
  
  // Trade Quality - REALISTIC (Balance quality with opportunity)
  MIN_CONFIDENCE: 60,               // Trade GOOD confidence signals (from 75)
  MIN_RISK_REWARD: 1.8,            // Minimum 1.8:1 reward:risk ratio (from 2.5)
  DAILY_MAX_TRADES: 4,              // MAX 4 trades per day - more opportunities!
  
  // Exit Rules (no greed)
  STOP_LOSS_PCT: 1.5,               // Tight 1.5% stop
  TAKE_PROFIT_PCT: 3.75,            // 2.5:1 reward:risk matches min
  TRAILING_STOP_ACTIVATION_PCT: 2.0,// Activate trailing after 2% profit
  TRAILING_STOP_DISTANCE_PCT: 1.0,   // Trail at 1% behind peak
  MAX_HOLD_HOURS: 24,               // Hold up to 24 hours for setup to work (was 6)
  HOLD_EXTENSION_PROFIT_PCT: 3.0,   // If >3% profit at 24h, allow extension
  HOLD_EXTENSION_MAX_HOURS: 48,    // Max 48 hours if in profit
  HOLD_EXTENSION_TRAIL_PCT: 0.8,   // Trail during extension
  
  // Learning
  MIN_TRADES_TO_LEARN: 5,           // Start adapting after 5 trades
  WEIGHT_BOOST_ON_WIN: 2,           // Boost indicator weight on win
  WEIGHT_PENALTY_ON_LOSS: 3,        // Penalize indicator weight on loss
  BLACKLIST_AFTER_LOSSES: 99,       // Disabled - replaced with adaptive learning
  // Instead of blacklisting, we reduce size and tighten confidence after losses
  LOSS_RECOVERY_SIZE_MULTIPLIER: 0.5,  // After 3 consecutive losses, use 50% position size
  LOSS_RECOVERY_CONFIDENCE_BOOST: 10, // After losses, require 10% higher confidence to enter
};

// ============================================
// STATE MANAGEMENT
// ============================================
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (_) {
    return { balance: 10000, totalPnl: 0, totalTrades: 0, peakBalance: 10000 };
  }
}

function loadBrain() {
  try {
    if (fs.existsSync(BRAIN_FILE)) {
      return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8'));
    }
  } catch (_) {}
  
  return {
    // Dynamic indicator weights (start equal, self-adjust)
    weights: {
      rsi: 50, macd: 50, ema: 50, bb: 50,
      stochastic: 50, adx: 50, volume: 50, pattern: 50
    },
    // Per-symbol performance tracking
    symbolStats: {},
    // Setup blacklist
    blacklistedSetups: [],
    // Win/loss patterns
    winPatterns: [],
    lossPatterns: [],
    // Daily tracking
    todayTrades: 0,
    todayPnl: 0,
    todayDate: null,
    // Learning log
    learningLog: [],
    // Consecutive losses counter
    consecutiveLosses: 0,
    // Regime performance
    regimeStats: { TRENDING: {w:0,l:0}, RANGING: {w:0,l:0}, VOLATILE: {w:0,l:0} },
  };
}

function saveBrain(brain) {
  fs.writeFileSync(BRAIN_FILE, JSON.stringify(brain, null, 2));
}

// ============================================
// PRINCIPLE 1: CAPITAL GUARDIAN
// ============================================
function assessCapitalRisk(balance) {
  const state = loadState();
  const peakBalance = state.peakBalance || balance;
  const drawdown = (peakBalance - balance) / peakBalance * 100;
  
  let tier = 0;
  let action = 'NORMAL';
  let sizeMultiplier = 1.0;
  let message = '';
  
  if (drawdown >= CONSTITUTION.TIER3_DRAWDOWN_PCT) {
    tier = 3; action = 'HALT'; sizeMultiplier = 0;
    message = `🛑 CAPITAL PROTECTION T3: ${drawdown.toFixed(1)}% drawdown → FULL HALT`;
  } else if (drawdown >= CONSTITUTION.TIER2_DRAWDOWN_PCT) {
    tier = 2; action = 'REDUCE_HALF'; sizeMultiplier = 0.25;
    message = `⛔ CAPITAL PROTECTION T2: ${drawdown.toFixed(1)} drawdown → 25% position size for recovery`;
  } else if (drawdown >= CONSTITUTION.TIER1_DRAWDOWN_PCT) {
    tier = 1; action = 'REDUCE'; sizeMultiplier = 0.5;
    message = `⚠️ CAPITAL PROTECTION T1: ${drawdown.toFixed(1)}% drawdown → 50% position size`;
  } else {
    message = `✅ Capital healthy: ${drawdown.toFixed(1)}% drawdown`;
  }
  
  return { tier, action, sizeMultiplier, drawdown, peakBalance, message };
}

// ============================================
// PRINCIPLE 2: DAILY PROFIT TRACKER
// ============================================
function getDailyStatus(brain, balance) {
  const today = new Date().toISOString().split('T')[0];
  
  // Reset daily counters at new day
  if (brain.todayDate !== today) {
    brain.todayDate = today;
    brain.todayTrades = 0;
    brain.todayPnl = 0;
    brain.dayStartBalance = balance;
  }
  
  const state = loadState();
  const dayStart = brain.dayStartBalance || balance;
  const currentDayPnl = balance - dayStart;

  const safeZone  = dayStart * (CONSTITUTION.DAILY_SAFE_ZONE_PCT / 100);
  const levZone   = dayStart * (CONSTITUTION.DAILY_LEVERAGE_ZONE_PCT / 100);
  const stopZone  = dayStart * (CONSTITUTION.DAILY_STOP_PCT / 100);
  const lossLimit = dayStart * (CONSTITUTION.DAILY_LOSS_LIMIT_PCT / 100);
  const weeklyNeeded = dayStart * (CONSTITUTION.WEEKLY_TARGET_PCT / 100 / 5); // per day

  // Zones:
  // BELOW_SAFE  = below 0.5%  → trade normally, seek opportunities
  // SAFE        = 0.5%-0.75%  → reduce aggression, only quality setups
  // LEVERAGE    = 0.75%-1.0%  → only A+ opportunities (confidence >= 80%)
  // STOP        = above 1.0%  → lock profits, no new trades
  let zone = 'BELOW_SAFE';
  if (currentDayPnl >= stopZone)  zone = 'STOP';
  else if (currentDayPnl >= levZone)  zone = 'LEVERAGE';
  else if (currentDayPnl >= safeZone) zone = 'SAFE';

  const lossLimitHit = currentDayPnl <= -lossLimit;
  const tradeCapHit  = brain.todayTrades >= CONSTITUTION.DAILY_MAX_TRADES;

  return {
    today, dayStart, currentDayPnl,
    safeZone, levZone, stopZone, lossLimit, weeklyNeeded,
    zone, lossLimitHit, tradeCapHit,
    tradesLeft: CONSTITUTION.DAILY_MAX_TRADES - brain.todayTrades,
    progressPct: (currentDayPnl / safeZone * 100).toFixed(1),
  };
}

// ============================================
// PRINCIPLE 3: NO GREED — EXIT DISCIPLINE
// ============================================
function getExitRules(direction, entryPrice, brain) {
  // Dynamic SL/TP based on brain confidence
  const brainConfidence = getBrainConfidence(brain);
  
  // More confident = slightly wider TP (but never greedy)
  const tpMultiplier = brainConfidence > 70 ? 1.1 : 1.0;
  
  const slPct = CONSTITUTION.STOP_LOSS_PCT;
  const tpPct = CONSTITUTION.TAKE_PROFIT_PCT * tpMultiplier;
  
  let stopLoss, takeProfit;
  if (direction === 'LONG') {
    stopLoss = entryPrice * (1 - slPct / 100);
    takeProfit = entryPrice * (1 + tpPct / 100);
  } else {
    stopLoss = entryPrice * (1 + slPct / 100);
    takeProfit = entryPrice * (1 - tpPct / 100);
  }
  
  const rr = tpPct / slPct;
  
  return { stopLoss, takeProfit, slPct, tpPct, riskReward: rr };
}

// ============================================
// PRINCIPLE 4: LEARN FROM EVERY TRADE
// ============================================
function learnFromTrade(trade, brain) {
  const isWin = parseFloat(trade.pnl) > 0;
  const symbol = trade.symbol;
  const indicators = trade.indicatorsSnapshot || {};
  
  // Update symbol stats
  if (!brain.symbolStats[symbol]) {
    brain.symbolStats[symbol] = { wins: 0, losses: 0, totalPnl: 0, consecutiveLosses: 0 };
  }
  const stats = brain.symbolStats[symbol];
  
  if (isWin) {
    stats.wins++;
    stats.consecutiveLosses = 0;
    brain.consecutiveLosses = 0;
    
    // Which indicators fired on this win? Boost their weight
    if (indicators.rsiSignal === 'correct') brain.weights.rsi = Math.min(100, brain.weights.rsi + CONSTITUTION.WEIGHT_BOOST_ON_WIN);
    if (indicators.macdSignal === 'correct') brain.weights.macd = Math.min(100, brain.weights.macd + CONSTITUTION.WEIGHT_BOOST_ON_WIN);
    if (indicators.emaSignal === 'correct') brain.weights.ema = Math.min(100, brain.weights.ema + CONSTITUTION.WEIGHT_BOOST_ON_WIN);
    if (indicators.bbSignal === 'correct') brain.weights.bb = Math.min(100, brain.weights.bb + CONSTITUTION.WEIGHT_BOOST_ON_WIN);
    
    // Record win pattern
    brain.winPatterns.push({
      symbol, direction: trade.side, pnl: trade.pnl,
      setup: indicators.setup || 'unknown',
      timestamp: Date.now()
    });
    if (brain.winPatterns.length > 50) brain.winPatterns.shift(); // keep last 50
    
  } else {
    stats.losses++;
    stats.consecutiveLosses++;
    brain.consecutiveLosses++;
    
    // Which indicators fired on this loss? Penalize their weight
    if (indicators.rsiSignal === 'triggered') brain.weights.rsi = Math.max(10, brain.weights.rsi - CONSTITUTION.WEIGHT_PENALTY_ON_LOSS);
    if (indicators.macdSignal === 'triggered') brain.weights.macd = Math.max(10, brain.weights.macd - CONSTITUTION.WEIGHT_PENALTY_ON_LOSS);
    if (indicators.emaSignal === 'triggered') brain.weights.ema = Math.max(10, brain.weights.ema - CONSTITUTION.WEIGHT_PENALTY_ON_LOSS);
    
    // Record loss pattern for analysis
    brain.lossPatterns.push({
      symbol, direction: trade.side, pnl: trade.pnl,
      reason: analyzeLossReason(trade),
      setup: indicators.setup || 'unknown',
      timestamp: Date.now()
    });
    if (brain.lossPatterns.length > 50) brain.lossPatterns.shift();
    
    // Recovery mode - instead of blacklisting, reduce size and tighten confidence after losses
    const recoveryKey = `${symbol}_${trade.side}`;
    if (stats.consecutiveLosses >= 3) {
      brain.recoveryMode = brain.recoveryMode || {};
      brain.recoveryMode[recoveryKey] = {
        sizeMultiplier: CONSTITUTION.LOSS_RECOVERY_SIZE_MULTIPLIER,
        confidenceBoost: CONSTITUTION.LOSS_RECOVERY_CONFIDENCE_BOOST,
        tradesRemaining: 3, // After 3 recovery trades, try normal sizing
        reason: `Entered recovery mode after ${stats.consecutiveLosses} consecutive losses`
      };
      brain.learningLog.push({
        timestamp: Date.now(),
        event: 'RECOVERY_MODE',
        message: `RECOVERY: ${symbol} ${trade.side} - 50% size, +10% confidence required for 3 trades`
      });
    }
  }
  
  stats.totalPnl += parseFloat(trade.pnl);
  
  // Learning log entry
  brain.learningLog.push({
    timestamp: Date.now(),
    event: isWin ? 'WIN_LEARNED' : 'LOSS_LEARNED',
    symbol, pnl: trade.pnl,
    weightsAfter: { ...brain.weights },
    message: isWin 
      ? `WIN: ${symbol} +$${trade.pnl} → boosted winning indicators`
      : `LOSS: ${symbol} $${trade.pnl} → penalized failing indicators, consecutive: ${brain.consecutiveLosses}`
  });
  
  if (brain.learningLog.length > 200) brain.learningLog = brain.learningLog.slice(-200);
  
  saveBrain(brain);
  return brain;
}

function analyzeLossReason(trade) {
  const pnlPct = Math.abs(trade.pnl) / (trade.entry_price * trade.quantity) * 100;
  if (pnlPct > 3) return 'LARGE_LOSS_BAD_DIRECTION';
  if (pnlPct > 1.5) return 'STOP_LOSS_HIT';
  return 'SMALL_LOSS_NOISE';
}

// ============================================
// PRINCIPLE 5: DYNAMIC BRAIN — SELF-IMPROVEMENT
// ============================================
function getBrainConfidence(brain) {
  // Overall system confidence based on recent performance
  const totalTrades = Object.values(brain.symbolStats)
    .reduce((s, st) => s + st.wins + st.losses, 0);
  const totalWins = Object.values(brain.symbolStats)
    .reduce((s, st) => s + st.wins, 0);
  
  if (totalTrades < 5) return 50; // Not enough data
  
  const winRate = totalWins / totalTrades * 100;
  const avgWeight = Object.values(brain.weights).reduce((s,w) => s+w, 0) / Object.keys(brain.weights).length;
  
  return Math.round((winRate * 0.6) + (avgWeight * 0.4));
}

function getDynamicWeights(brain) {
  // Convert brain weights (0-100 trust scores) to signal weights
  const total = Object.values(brain.weights).reduce((s,w) => s+w, 0);
  const normalized = {};
  for (const [k, v] of Object.entries(brain.weights)) {
    normalized[k] = (v / total) * 100; // percentage weight
  }
  return normalized;
}

function isSetupBlacklisted(symbol, direction, brain) {
  const key = `${symbol}_${direction}`;
  return brain.blacklistedSetups.includes(key);
}

// Recovery mode check - instead of blacklisting, we reduce size and tighten confidence
function getRecoveryMode(symbol, direction, brain) {
  const key = `${symbol}_${direction}`;
  const recovery = brain.recoveryMode ? brain.recoveryMode[key] : null;
  
  if (!recovery) return null; // No recovery needed
  
  if (recovery.tradesRemaining <= 0) {
    // Clean up expired recovery mode
    delete brain.recoveryMode[key];
    return null;
  }
  
  return {
    sizeMultiplier: recovery.sizeMultiplier,
    confidenceBoost: recovery.confidenceBoost,
    tradesRemaining: recovery.tradesRemaining,
    reason: recovery.reason
  };
}

// ============================================
// PRINCIPLE 6: POSITION SIZING (PRINCIPLED)
// ============================================
function calculatePrincipledPositionSize(balance, entryPrice, stopLoss, capitalRisk) {
  const riskAmount = balance * (CONSTITUTION.MAX_RISK_PER_TRADE_PCT / 100) * capitalRisk.sizeMultiplier;
  const stopDistance = Math.abs(entryPrice - stopLoss);
  
  if (stopDistance <= 0) return 0;
  
  let qty = riskAmount / stopDistance;
  
  // Hard cap: never exceed MAX_POSITION_EXPOSURE_PCT of account
  const maxExposure = balance * (CONSTITUTION.MAX_POSITION_EXPOSURE_PCT / 100);
  if (qty * entryPrice > maxExposure) qty = maxExposure / entryPrice;
  
  // Round precision
  if (entryPrice < 0.01) return Math.floor(qty);
  if (entryPrice < 1) return parseFloat(qty.toFixed(0));
  if (entryPrice < 100) return parseFloat(qty.toFixed(2));
  return parseFloat(qty.toFixed(4));
}

// ============================================
// GENERATE DAILY SELF-ASSESSMENT REPORT
// ============================================
function generateSelfAssessment(brain, balance) {
  const state = loadState();
  const daily = getDailyStatus(brain, balance);
  const capitalRisk = assessCapitalRisk(balance);
  const brainConf = getBrainConfidence(brain);
  
  const totalWins = Object.values(brain.symbolStats).reduce((s,st) => s+st.wins, 0);
  const totalLosses = Object.values(brain.symbolStats).reduce((s,st) => s+st.losses, 0);
  const winRate = totalWins + totalLosses > 0 ? (totalWins/(totalWins+totalLosses)*100).toFixed(1) : 'N/A';
  
  // Best and worst symbols
  const symbolPnl = Object.entries(brain.symbolStats)
    .map(([sym, st]) => ({ sym, pnl: st.totalPnl, wr: st.wins/(st.wins+st.losses||1)*100 }))
    .sort((a,b) => b.pnl - a.pnl);
  
  const report = {
    timestamp: new Date().toISOString(),
    balance,
    drawdown: capitalRisk.drawdown.toFixed(2) + '%',
    capitalStatus: capitalRisk.action,
    brainConfidence: brainConf + '%',
    winRate: winRate + '%',
    totalTrades: totalWins + totalLosses,
    todayPnl: daily.currentDayPnl.toFixed(2),
    todayTarget: (daily.safeZone || 0).toFixed(2),
    bestSymbols: symbolPnl.slice(0,3).map(s => `${s.sym}: $${s.pnl.toFixed(2)}`),
    worstSymbols: symbolPnl.slice(-2).map(s => `${s.sym}: $${s.pnl.toFixed(2)}`),
    blacklistedSetups: brain.blacklistedSetups,
    indicatorWeights: brain.weights,
    recentLearnings: brain.learningLog.slice(-5).map(l => l.message),
    consecutiveLosses: brain.consecutiveLosses,
    recommendation: generateRecommendation(brain, capitalRisk, daily),
  };
  
  return report;
}

function generateRecommendation(brain, capitalRisk, daily) {
  if (capitalRisk.action === 'HALT')     return '🛑 HALT: Drawdown >15%. Protect remaining capital.';
  if (capitalRisk.action === 'STOP_NEW') return '⛔ Drawdown >10%. Manage existing positions only. No new entries.';
  if (daily.lossLimitHit)  return '🔴 DAILY LOSS LIMIT HIT (2%). Stop trading for today.';
  if (daily.zone === 'STOP') return '🎯 DAILY STOP ZONE (>1% net). Profits locked. Close day.';
  if (daily.zone === 'LEVERAGE') return '🟠 LEVERAGE ZONE (0.75%+). Only A+ setups ≥80% confidence. Protect gains.';
  if (daily.zone === 'SAFE') return '🟡 SAFE ZONE (0.5%+ net). Daily base profit secured. Be selective, quality only.';
  if (brain.consecutiveLosses >= 3) return '⚠️ 3 CONSECUTIVE LOSSES. Pause. Reduce size. Wait for A+ setup.';
  if (daily.tradesLeft <= 1) return '⏰ Trade cap near. This next trade must be A+.';
  const needed = (daily.weeklyNeeded - daily.currentDayPnl).toFixed(2);
  return `🟢 BELOW SAFE ZONE. Need +$${needed} more for today's 0.5% target. Hunt quality setups.`;
}

module.exports = {
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
  generateRecommendation,
};
