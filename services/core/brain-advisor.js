/**
 * Brain Advisor — Connects Shadow Learning to Real Trading Decisions
 * 
 * The missing link: shadow-learner.js collects accuracy data,
 * brain-advisor.js USES that data to make smarter entry decisions.
 * 
 * Key functions:
 * 1. getSmartConfidence()  — adjusts confidence based on shadow accuracy
 * 2. getBestTradingWindow() — tells engine what hours/regimes to prefer
 * 3. getSymbolBias()       — per-symbol accuracy-weighted bias
 * 4. shouldTrustSignal()   — final gate: is this signal trustworthy?
 * 5. getAdaptiveWeights()  — merge shadow accuracy INTO brain weights
 */

const fs   = require('fs');
const path = require('path');

const ACCURACY_FILE  = path.join(__dirname, '../../data/signal-accuracy.json');
const BRAIN_FILE     = path.join(__dirname, '../../data/brain.json');
const SHADOW_FILE    = path.join(__dirname, '../../data/shadow-signals.json');
const MIN_SAMPLES    = 5;   // need at least 5 evaluations before trusting accuracy
const MIN_ACCURACY   = 52;  // indicator must beat 52% to be used (>random)

// ============================================
// LOAD HELPERS
// ============================================
function loadAccuracy() {
  try { return JSON.parse(fs.readFileSync(ACCURACY_FILE, 'utf8')); }
  catch(_) { return null; }
}

function loadBrainRaw() {
  try { return JSON.parse(fs.readFileSync(BRAIN_FILE, 'utf8')); }
  catch(_) { return null; }
}

function loadShadowSignals() {
  try { return JSON.parse(fs.readFileSync(SHADOW_FILE, 'utf8')); }
  catch(_) { return []; }
}

// ============================================
// 1. SMART CONFIDENCE — Shadow-Adjusted Score
// ============================================
/**
 * Takes raw signal confidence and adjusts it based on:
 * - Historical accuracy of the indicators that fired
 * - Symbol-specific accuracy
 * - Current market regime accuracy
 * - Time of day accuracy
 */
function getSmartConfidence(rawConfidence, symbol, indicatorsFired, regime) {
  const accuracy = loadAccuracy();
  if (!accuracy) return { score: rawConfidence, adjustments: [], trusted: false };

  let totalAdjustment = 0;
  const adjustments = [];

  // 1. Indicator accuracy adjustments
  for (const ind of (indicatorsFired || [])) {
    const indData = accuracy.indicators[ind];
    if (!indData) continue;
    const total = indData.correct + indData.wrong;
    if (total < MIN_SAMPLES) continue; // not enough data yet

    const acc = indData.accuracy;
    if (acc > 65) {
      const boost = Math.min(10, (acc - 65) * 0.5);
      totalAdjustment += boost;
      adjustments.push(`+${boost.toFixed(1)} (${ind} ${acc}%✅)`);
    } else if (acc < MIN_ACCURACY) {
      const penalty = Math.min(15, (MIN_ACCURACY - acc) * 0.8);
      totalAdjustment -= penalty;
      adjustments.push(`-${penalty.toFixed(1)} (${ind} ${acc}%⚠️)`);
    }
  }

  // 2. Symbol-specific accuracy
  const symData = accuracy.bySymbol?.[symbol];
  if (symData) {
    const total = symData.correct + symData.wrong;
    if (total >= MIN_SAMPLES) {
      if (symData.accuracy > 60) {
        const boost = Math.min(8, (symData.accuracy - 60) * 0.4);
        totalAdjustment += boost;
        adjustments.push(`+${boost.toFixed(1)} (${symbol} ${symData.accuracy}%✅)`);
      } else if (symData.accuracy < 45) {
        const penalty = Math.min(10, (45 - symData.accuracy) * 0.5);
        totalAdjustment -= penalty;
        adjustments.push(`-${penalty.toFixed(1)} (${symbol} ${symData.accuracy}%⚠️)`);
      }
    }
  }

  // 3. Regime accuracy
  const regData = accuracy.byRegime?.[regime];
  if (regData) {
    const total = (regData.correct || 0) + (regData.wrong || 0);
    if (total >= MIN_SAMPLES) {
      const regAcc = (regData.correct / total * 100);
      if (regAcc > 60) {
        const boost = Math.min(5, (regAcc - 60) * 0.3);
        totalAdjustment += boost;
        adjustments.push(`+${boost.toFixed(1)} (${regime} regime✅)`);
      } else if (regAcc < 45) {
        const penalty = Math.min(8, (45 - regAcc) * 0.4);
        totalAdjustment -= penalty;
        adjustments.push(`-${penalty.toFixed(1)} (${regime} regime⚠️)`);
      }
    }
  }

  // 4. Time of day accuracy
  const hour = new Date().getUTCHours().toString();
  const hourData = accuracy.byHour?.[hour];
  if (hourData) {
    const total = (hourData.correct || 0) + (hourData.wrong || 0);
    if (total >= MIN_SAMPLES) {
      const hourAcc = (hourData.correct / total * 100);
      if (hourAcc > 60) {
        totalAdjustment += 3;
        adjustments.push(`+3 (hour ${hour}:00 UTC✅)`);
      } else if (hourAcc < 40) {
        totalAdjustment -= 5;
        adjustments.push(`-5 (hour ${hour}:00 UTC⚠️)`);
      }
    }
  }

  const smartScore = Math.max(0, Math.min(100, rawConfidence + totalAdjustment));
  const trusted = smartScore >= 60 && totalAdjustment >= -5; // not heavily penalized

  return {
    rawConfidence,
    score: Math.round(smartScore),
    totalAdjustment: parseFloat(totalAdjustment.toFixed(1)),
    adjustments,
    trusted,
    hasEnoughData: Object.values(accuracy.indicators || {})
      .some(i => (i.correct + i.wrong) >= MIN_SAMPLES),
  };
}

// ============================================
// 2. BEST TRADING WINDOW
// ============================================
function getBestTradingWindow() {
  const accuracy = loadAccuracy();
  if (!accuracy?.byHour) return { bestHours: [], worstHours: [], recommendation: 'Accumulating data...' };

  const hourStats = Object.entries(accuracy.byHour)
    .map(([h, v]) => {
      const total = v.correct + v.wrong;
      return { hour: parseInt(h), accuracy: total > 0 ? v.correct/total*100 : 50, total };
    })
    .filter(x => x.total >= MIN_SAMPLES)
    .sort((a,b) => b.accuracy - a.accuracy);

  const bestHours  = hourStats.slice(0, 3).map(h => `${h.hour}:00 UTC (${h.accuracy.toFixed(0)}%)`);
  const worstHours = hourStats.slice(-3).map(h => `${h.hour}:00 UTC (${h.accuracy.toFixed(0)}%)`);

  const currentHour = new Date().getUTCHours();
  const currentStats = hourStats.find(h => h.hour === currentHour);
  const isGoodTime = currentStats ? currentStats.accuracy >= 55 : true; // assume good if no data

  return {
    bestHours,
    worstHours,
    isGoodTime,
    currentHourAccuracy: currentStats ? currentStats.accuracy.toFixed(1) + '%' : 'unknown',
    recommendation: isGoodTime
      ? `✅ Good trading window (${currentStats?.accuracy.toFixed(0) || '?'}% accuracy at ${currentHour}:00 UTC)`
      : `⚠️ Poor trading window (${currentStats?.accuracy.toFixed(0) || '?'}% accuracy at ${currentHour}:00 UTC) — raise confidence threshold`,
  };
}

// ============================================
// 3. SYMBOL BIAS — Which symbols to prefer
// ============================================
function getSymbolBias() {
  const accuracy = loadAccuracy();
  if (!accuracy?.bySymbol) return {};

  const bias = {};
  for (const [sym, data] of Object.entries(accuracy.bySymbol)) {
    const total = data.correct + data.wrong;
    if (total < MIN_SAMPLES) {
      bias[sym] = { multiplier: 1.0, confidence: data.accuracy, dataPoints: total, note: 'insufficient data' };
      continue;
    }
    // > 60% accuracy → boost (max 1.3x), < 45% → penalize (min 0.6x)
    let multiplier = 1.0;
    if (data.accuracy > 65)      multiplier = 1.3;
    else if (data.accuracy > 60) multiplier = 1.15;
    else if (data.accuracy < 40) multiplier = 0.6;
    else if (data.accuracy < 45) multiplier = 0.75;

    bias[sym] = {
      multiplier,
      accuracy: data.accuracy,
      dataPoints: total,
      note: multiplier > 1 ? 'high accuracy — prefer' : multiplier < 1 ? 'low accuracy — avoid' : 'neutral',
    };
  }
  return bias;
}

// ============================================
// 4. SHOULD TRUST SIGNAL — Final Gate
// ============================================
function shouldTrustSignal(symbol, direction, confidence, regime, indicatorsFired) {
  const accuracy   = loadAccuracy();
  const shadowSignals = loadShadowSignals();

  // Not enough data yet? Trust the signal (can't penalize what we don't know)
  if (!accuracy || accuracy.total.evaluated < 10) {
    return { trust: true, reason: 'Insufficient shadow data — defaulting to trust', confidence };
  }

  // Check recent shadow signals for this symbol — last 3 predictions
  const recentForSymbol = shadowSignals
    .filter(s => s.symbol === symbol && s.evaluated)
    .slice(-3);

  if (recentForSymbol.length >= 3) {
    const recentCorrect = recentForSymbol.filter(s => s.wasCorrect).length;
    if (recentCorrect === 0) {
      return {
        trust: false,
        reason: `${symbol}: last 3 shadow predictions ALL wrong — skip this cycle`,
        confidence,
      };
    }
  }

  // Check if same direction was recently wrong
  const sameDirectionWrong = shadowSignals
    .filter(s => s.symbol === symbol && s.consensus === direction && s.evaluated && !s.wasCorrect)
    .slice(-2);

  if (sameDirectionWrong.length >= 2) {
    return {
      trust: false,
      reason: `${symbol} ${direction}: 2 recent shadow failures in same direction — wait`,
      confidence,
    };
  }

  const smartConf = getSmartConfidence(confidence, symbol, indicatorsFired, regime);
  return {
    trust: smartConf.trusted,
    reason: smartConf.trusted
      ? `Smart confidence ${smartConf.score}% (adjusted ${smartConf.totalAdjustment > 0 ? '+' : ''}${smartConf.totalAdjustment})`
      : `Smart confidence too low: ${smartConf.score}% after adjustments`,
    confidence: smartConf.score,
    adjustments: smartConf.adjustments,
  };
}

// ============================================
// 5. ADAPTIVE WEIGHTS — Merge shadow into brain
// ============================================
/**
 * Every cycle, recalibrate brain weights based on shadow accuracy.
 * Shadow accuracy is the GROUND TRUTH — real price action decided.
 * 
 * FIXED: Faster alignment (50% per cycle instead of 10%)
 */
function recalibrateWeights(brain) {
  const accuracy = loadAccuracy();
  if (!accuracy) return brain;

  let changed = [];
  const LEARN_RATE = 0.5; // 50% toward target per cycle (was 10%)

  for (const [ind, data] of Object.entries(accuracy.indicators)) {
    if (!brain.weights[ind]) continue;
    const total = data.correct + data.wrong;
    if (total < MIN_SAMPLES) continue;

    // Target weight based on accuracy: 50% accuracy → weight 50, 70% → weight 100
    // Linear mapping: accuracy - 30 = weight (50% acc = 20 → *2.5 = 50)
    const targetWeight = Math.max(10, Math.min(100, (data.accuracy - 30) * 2.5));
    const currentWeight = brain.weights[ind];
    
    // Move toward target (50% per cycle for fast learning)
    const newWeight = Math.round(currentWeight + (targetWeight - currentWeight) * LEARN_RATE);
    
    if (newWeight !== currentWeight) {
      brain.weights[ind] = newWeight;
      const dir = newWeight > currentWeight ? '↑' : '↓';
      changed.push(`${ind}: ${currentWeight}→${newWeight}${dir} (shadow acc ${data.accuracy}%)`);
    }
  }

  // Also adjust symbol preferences based on actual performance
  for (const [sym, data] of Object.entries(accuracy.bySymbol || {})) {
    const total = data.correct + data.wrong;
    if (total < MIN_SAMPLES * 2) continue; // Need more data for symbols
    
    const symAcc = data.accuracy;
    const multiplier = symAcc > 55 ? 1.2 : symAcc < 45 ? 0.7 : 1.0;
    
    if (!brain.symbolWeights) brain.symbolWeights = {};
    brain.symbolWeights[sym] = brain.symbolWeights[sym] 
      ? Math.round(brain.symbolWeights[sym] * 0.7 + multiplier * 0.3)
      : 50;
  }

  if (changed.length > 0) {
    console.log(`  🔧 RECALIBRATED weights from shadow data:`);
    changed.forEach(c => console.log(`     ${c}`));
    brain.lastWeightCalibration = Date.now();
  }

  return brain;
}

// ============================================
// 6. LEARNING SUMMARY for Telegram
// ============================================
function getLearningDigest() {
  const accuracy = loadAccuracy();
  if (!accuracy || accuracy.total.evaluated < 5) {
    return '📚 Shadow learning: accumulating data... (need 5+ evaluations)';
  }

  const overall = (accuracy.total.correct / accuracy.total.evaluated * 100).toFixed(1);

  const indStats = Object.entries(accuracy.indicators)
    .map(([k, v]) => ({ name: k, accuracy: v.accuracy, total: v.correct + v.wrong }))
    .filter(x => x.total >= MIN_SAMPLES)
    .sort((a, b) => b.accuracy - a.accuracy);

  const best  = indStats[0];
  const worst = indStats[indStats.length - 1];

  const bestSym = Object.entries(accuracy.bySymbol || {})
    .map(([s, v]) => ({ s, accuracy: v.accuracy, total: v.correct + v.wrong }))
    .filter(x => x.total >= MIN_SAMPLES)
    .sort((a, b) => b.accuracy - a.accuracy)[0];

  let msg = `📚 *Shadow Learning (${accuracy.total.evaluated} evals)*\n`;
  msg += `Overall: ${overall}%\n`;
  if (best)    msg += `🏆 Best: ${best.name} (${best.accuracy}%)\n`;
  if (worst)   msg += `⚠️ Worst: ${worst.name} (${worst.accuracy}%)\n`;
  if (bestSym) msg += `📈 Best symbol: ${bestSym.s} (${bestSym.accuracy}%)`;

  return msg;
}

module.exports = {
  getSmartConfidence,
  getBestTradingWindow,
  getSymbolBias,
  shouldTrustSignal,
  recalibrateWeights,
  getLearningDigest,
};
