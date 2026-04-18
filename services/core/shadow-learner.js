/**
 * Shadow Learner — Learn from Live Price Action WITHOUT Trading
 * 
 * How it works:
 * 1. Every hour: generate signals for all symbols, record prediction + price
 * 2. 4 hours later: check actual price outcome vs prediction
 * 3. Was the signal RIGHT or WRONG? Update brain indicator weights
 * 4. Build accuracy database per indicator per market condition
 * 
 * This gives 10 symbols × 24 hours = 240 learning events per day
 * Brain gets smarter every hour even when not trading
 */

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { loadBrain, saveBrain, CONSTITUTION } = require('./principles');

const SHADOW_FILE  = path.join(__dirname, '../../data/shadow-signals.json');
const ACCURACY_FILE = path.join(__dirname, '../../data/signal-accuracy.json');
const LOOKAHEAD_HOURS = 4; // evaluate signal outcome after 4 hours

// ============================================
// HELPERS
// ============================================
function loadShadowSignals() {
  try { return JSON.parse(fs.readFileSync(SHADOW_FILE, 'utf8')); }
  catch (_) { return []; }
}

function saveShadowSignals(signals) {
  fs.writeFileSync(SHADOW_FILE, JSON.stringify(signals, null, 2));
}

function loadAccuracy() {
  try { return JSON.parse(fs.readFileSync(ACCURACY_FILE, 'utf8')); }
  catch (_) {
    return {
      indicators: {
        rsi:        { correct: 0, wrong: 0, accuracy: 50 },
        macd:       { correct: 0, wrong: 0, accuracy: 50 },
        ema:        { correct: 0, wrong: 0, accuracy: 50 },
        volume:     { correct: 0, wrong: 0, accuracy: 50 },
        trend:      { correct: 0, wrong: 0, accuracy: 50 },
        bb:         { correct: 0, wrong: 0, accuracy: 50 },
        stochastic: { correct: 0, wrong: 0, accuracy: 50 },
      },
      bySymbol: {},
      byRegime: { TRENDING: {correct:0,wrong:0}, RANGING: {correct:0,wrong:0}, VOLATILE: {correct:0,wrong:0} },
      byHour:   {}, // accuracy per hour of day
      total:    { evaluated: 0, correct: 0 },
      lastUpdated: null,
    };
  }
}

function saveAccuracy(acc) {
  acc.lastUpdated = new Date().toISOString();
  fs.writeFileSync(ACCURACY_FILE, JSON.stringify(acc, null, 2));
}

// ============================================
// PRICE + INDICATOR FETCH
// ============================================
async function getCandles(symbol, interval = '1h', limit = 100) {
  try {
    const r = await axios.get('https://api.binance.com/api/v3/klines', {
      params: { symbol, interval, limit },
      timeout: 8000
    });
    return r.data.map(k => ({
      time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
    }));
  } catch(e) { return null; }
}

async function getPrice(symbol) {
  try {
    const r = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, { timeout: 5000 });
    return parseFloat(r.data.price);
  } catch(e) { return null; }
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const ch = candles[i].close - candles[i-1].close;
    if (ch > 0) g += ch; else l -= ch;
  }
  const rs = l === 0 ? 100 : (g/period) / (l/period);
  return 100 - (100 / (1 + rs));
}

function calcEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1-k);
  return ema;
}

function calcMACD(candles) {
  return calcEMA(candles, 12) - calcEMA(candles, 26);
}

function calcVolRatio(candles, period = 20) {
  const recent = candles[candles.length-1].volume;
  const avg = candles.slice(-period-1,-1).reduce((s,c) => s+c.volume, 0) / period;
  return avg > 0 ? recent / avg : 1;
}

function calcBB(candles, period = 20) {
  const slice = candles.slice(-period);
  const sma = slice.reduce((s,c) => s+c.close, 0) / period;
  const std = Math.sqrt(slice.reduce((s,c) => s+Math.pow(c.close-sma,2), 0) / period);
  const price = candles[candles.length-1].close;
  return { upper: sma + 2*std, lower: sma - 2*std, sma, position: (price - sma) / (2*std) };
}

function detectRegime(candles) {
  const rsi = calcRSI(candles);
  const ema9 = calcEMA(candles, 9);
  const ema21 = calcEMA(candles, 21);
  const emaDiff = Math.abs(ema9 - ema21) / ema21 * 100;
  if (emaDiff > 1.5) return 'TRENDING';
  if (calcVolRatio(candles) > 1.5) return 'VOLATILE';
  return 'RANGING';
}

// ============================================
// STEP 1: RECORD SHADOW SIGNALS (every hour)
// ============================================
async function recordShadowSignals(watchlist) {
  console.log('\n📸 Recording shadow signals for learning...');
  const signals = loadShadowSignals();
  const now = Date.now();
  const evaluateAt = now + LOOKAHEAD_HOURS * 60 * 60 * 1000;
  let recorded = 0;

  for (const symbol of watchlist) {
    try {
      const candles = await getCandles(symbol, '1h', 100);
      if (!candles || candles.length < 50) continue;

      const price    = candles[candles.length-1].close;
      const rsi      = calcRSI(candles);
      const ema9     = calcEMA(candles, 9);
      const ema21    = calcEMA(candles, 21);
      const macd     = calcMACD(candles);
      const volRatio = calcVolRatio(candles);
      const bb       = calcBB(candles);
      const regime   = detectRegime(candles);
      const trend    = ema9 > ema21 ? 'BULLISH' : 'BEARISH';
      const hour     = new Date().getUTCHours();

      // What does each indicator predict independently?
      const predictions = {
        rsi:    rsi < 35 ? 'LONG' : rsi > 65 ? 'SHORT' : 'HOLD',
        macd:   macd > 0 ? 'LONG' : 'SHORT',
        ema:    ema9 > ema21 ? 'LONG' : 'SHORT',
        volume: volRatio > 1.2 ? 'CONFIRMING' : volRatio < 0.8 ? 'WEAK' : 'NEUTRAL',
        trend:  trend === 'BULLISH' ? 'LONG' : 'SHORT',
        bb:     bb.position < -0.8 ? 'LONG' : bb.position > 0.8 ? 'SHORT' : 'HOLD',
      };

      // Consensus signal
      const longs  = Object.values(predictions).filter(p => p === 'LONG').length;
      const shorts = Object.values(predictions).filter(p => p === 'SHORT').length;
      const consensus = longs > shorts ? 'LONG' : shorts > longs ? 'SHORT' : 'HOLD';

      signals.push({
        id: `${symbol}_${now}`,
        symbol, price, timestamp: now,
        evaluateAt,
        evaluated: false,
        indicators: { rsi, ema9, ema21, macd, volRatio, bbPosition: bb.position },
        predictions,
        consensus,
        regime,
        trend,
        hour,
      });

      recorded++;
      console.log(`  📊 ${symbol}: ${consensus} @ $${price.toFixed(4)} | RSI:${rsi.toFixed(1)} MACD:${macd > 0 ? '+' : '-'} EMA:${trend} Regime:${regime}`);

    } catch(e) {
      console.log(`  ❌ ${symbol}: ${e.message}`);
    }
  }

  // Keep only last 500 signals (don't grow forever)
  const trimmed = signals.slice(-500);
  saveShadowSignals(trimmed);
  console.log(`  ✅ Recorded ${recorded} shadow signals`);
  return recorded;
}

// ============================================
// STEP 2: EVALUATE PAST PREDICTIONS (every hour)
// ============================================
async function evaluatePastPredictions(brain) {
  const signals  = loadShadowSignals();
  const accuracy = loadAccuracy();
  const now      = Date.now();
  const MIN_MOVE = 0.003; // 0.3% minimum to count as a clear move

  const pending = signals.filter(s => !s.evaluated && s.evaluateAt <= now);
  if (pending.length === 0) {
    console.log('  ⏳ No signals ready for evaluation yet');
    return { evaluated: 0 };
  }

  console.log(`\n🎓 Evaluating ${pending.length} past predictions...`);
  let evaluated = 0, correct = 0, wrong = 0;
  const weightDeltas = {}; // accumulate weight changes

  for (const signal of pending) {
    const currentPrice = await getPrice(signal.symbol);
    if (!currentPrice) continue;

    const priceChange = (currentPrice - signal.price) / signal.price;
    const actualMove = Math.abs(priceChange) >= MIN_MOVE
      ? (priceChange > 0 ? 'LONG' : 'SHORT')
      : 'HOLD'; // price didn't move enough = inconclusive

    if (actualMove === 'HOLD') {
      signal.evaluated = true;
      signal.outcome = 'INCONCLUSIVE';
      continue; // skip inconclusive moves, don't update weights
    }

    // Evaluate each indicator's prediction
    const indicatorResults = {};
    for (const [ind, pred] of Object.entries(signal.predictions)) {
      if (pred === 'HOLD' || pred === 'CONFIRMING' || pred === 'WEAK' || pred === 'NEUTRAL') continue;
      const wasRight = pred === actualMove;
      indicatorResults[ind] = wasRight;

      if (!accuracy.indicators[ind]) accuracy.indicators[ind] = { correct:0, wrong:0, accuracy:50 };
      if (wasRight) {
        accuracy.indicators[ind].correct++;
        weightDeltas[ind] = (weightDeltas[ind] || 0) + CONSTITUTION.WEIGHT_BOOST_ON_WIN;
      } else {
        accuracy.indicators[ind].wrong++;
        weightDeltas[ind] = (weightDeltas[ind] || 0) - CONSTITUTION.WEIGHT_PENALTY_ON_LOSS;
      }
      // Recalculate accuracy %
      const total = accuracy.indicators[ind].correct + accuracy.indicators[ind].wrong;
      accuracy.indicators[ind].accuracy = parseFloat((accuracy.indicators[ind].correct / total * 100).toFixed(1));
    }

    // Consensus accuracy
    const consensusRight = signal.consensus === actualMove;
    if (signal.consensus !== 'HOLD') {
      if (consensusRight) correct++; else wrong++;
    }

    // Per-symbol tracking
    if (!accuracy.bySymbol[signal.symbol]) accuracy.bySymbol[signal.symbol] = { correct:0, wrong:0, accuracy:50 };
    if (signal.consensus !== 'HOLD') {
      if (consensusRight) accuracy.bySymbol[signal.symbol].correct++;
      else accuracy.bySymbol[signal.symbol].wrong++;
      const st = accuracy.bySymbol[signal.symbol];
      st.accuracy = parseFloat((st.correct/(st.correct+st.wrong)*100).toFixed(1));
    }

    // Per-regime tracking
    if (signal.regime && signal.consensus !== 'HOLD') {
      if (!accuracy.byRegime[signal.regime]) accuracy.byRegime[signal.regime] = {correct:0,wrong:0};
      if (consensusRight) accuracy.byRegime[signal.regime].correct++;
      else accuracy.byRegime[signal.regime].wrong++;
    }

    // Per-hour tracking
    const h = signal.hour?.toString() || '0';
    if (!accuracy.byHour[h]) accuracy.byHour[h] = {correct:0,wrong:0};
    if (signal.consensus !== 'HOLD') {
      if (consensusRight) accuracy.byHour[h].correct++;
      else accuracy.byHour[h].wrong++;
    }

    // Log result
    const icon = consensusRight ? '✅' : '❌';
    const pct = (priceChange * 100).toFixed(2);
    console.log(`  ${icon} ${signal.symbol}: predicted ${signal.consensus} → actual ${actualMove} (${pct}%) | Regime:${signal.regime}`);

    signal.evaluated  = true;
    signal.outcome    = actualMove;
    signal.priceChange = priceChange;
    signal.wasCorrect = consensusRight;
    evaluated++;
  }

  // Apply accumulated weight changes to brain (smoothed)
  let weightChanges = [];
  for (const [ind, delta] of Object.entries(weightDeltas)) {
    if (brain.weights[ind] !== undefined) {
      const smoothedDelta = delta * 0.3; // smooth learning rate for shadow (less aggressive than real trades)
      brain.weights[ind] = Math.max(10, Math.min(100, brain.weights[ind] + smoothedDelta));
      weightChanges.push(`${ind}:${delta > 0 ? '+' : ''}${delta.toFixed(1)}`);
    }
  }

  // Update totals
  accuracy.total.evaluated += evaluated;
  accuracy.total.correct   += correct;

  // Save everything
  saveShadowSignals(signals);
  saveAccuracy(accuracy);
  saveBrain(brain);

  const overallAcc = accuracy.total.evaluated > 0
    ? (accuracy.total.correct / accuracy.total.evaluated * 100).toFixed(1)
    : 0;

  console.log(`\n  📊 Shadow Results: ${correct}✅ ${wrong}❌ | Overall accuracy: ${overallAcc}%`);
  if (weightChanges.length > 0) {
    console.log(`  🔧 Weight adjustments: ${weightChanges.join(' | ')}`);
  }

  // Best and worst indicators
  const indStats = Object.entries(accuracy.indicators)
    .map(([k,v]) => ({ name: k, ...v }))
    .sort((a,b) => b.accuracy - a.accuracy);
  console.log(`  🏆 Best indicators: ${indStats.slice(0,3).map(i => `${i.name}(${i.accuracy}%)`).join(' ')}`);
  console.log(`  ⚠️  Worst indicators: ${indStats.slice(-2).map(i => `${i.name}(${i.accuracy}%)`).join(' ')}`);

  // Best regime/hour
  const bestSymbol = Object.entries(accuracy.bySymbol)
    .map(([s,v]) => ({s, acc: v.accuracy, total: v.correct+v.wrong}))
    .filter(x => x.total >= 3)
    .sort((a,b) => b.acc - a.acc)[0];
  if (bestSymbol) console.log(`  📈 Best symbol: ${bestSymbol.s} (${bestSymbol.acc}% accuracy)`);

  return { evaluated, correct, wrong, overallAcc, brain };
}

// ============================================
// GENERATE LEARNING REPORT
// ============================================
function generateLearningReport(accuracy, brain) {
  const indStats = Object.entries(accuracy.indicators)
    .map(([k,v]) => ({ name: k, accuracy: v.accuracy, total: v.correct+v.wrong }))
    .filter(x => x.total > 0)
    .sort((a,b) => b.accuracy - a.accuracy);

  const bestRegime = Object.entries(accuracy.byRegime)
    .map(([r,v]) => ({ r, acc: v.correct+v.wrong > 0 ? (v.correct/(v.correct+v.wrong)*100).toFixed(1) : 0, total: v.correct+v.wrong }))
    .filter(x => x.total >= 3)
    .sort((a,b) => b.acc - a.acc)[0];

  const bestHour = Object.entries(accuracy.byHour)
    .map(([h,v]) => ({ h, acc: v.correct+v.wrong > 0 ? (v.correct/(v.correct+v.wrong)*100).toFixed(1) : 0, total: v.correct+v.wrong }))
    .filter(x => x.total >= 3)
    .sort((a,b) => b.acc - a.acc)[0];

  return {
    totalEvaluated: accuracy.total.evaluated,
    overallAccuracy: accuracy.total.evaluated > 0 
      ? (accuracy.total.correct / accuracy.total.evaluated * 100).toFixed(1) + '%'
      : 'N/A',
    bestIndicator:  indStats[0] ? `${indStats[0].name} (${indStats[0].accuracy}%)` : 'N/A',
    worstIndicator: indStats[indStats.length-1] ? `${indStats[indStats.length-1].name} (${indStats[indStats.length-1].accuracy}%)` : 'N/A',
    bestRegime:     bestRegime ? `${bestRegime.r} (${bestRegime.acc}%)` : 'N/A',
    bestTradingHour: bestHour ? `${bestHour.h}:00 UTC (${bestHour.acc}%)` : 'N/A',
    currentWeights: brain.weights,
    recommendation: indStats[0] ? `Trust ${indStats[0].name} most — ${indStats[0].accuracy}% accurate on real price action` : 'Accumulating data...',
  };
}

// ============================================
// MAIN SHADOW LEARNING CYCLE
// ============================================
async function runShadowLearning(watchlist) {
  const WATCHLIST = watchlist || [
    'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
    'ADAUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','POLUSDT'
  ];

  console.log('═'.repeat(55));
  console.log('🎓 SHADOW LEARNER — Learning from Live Price Action');
  console.log('═'.repeat(55));

  const brain = loadBrain();

  // Step 1: Evaluate past predictions (what happened after 4h?)
  const evalResults = await evaluatePastPredictions(brain);

  // Step 2: Record new predictions for this hour
  const recorded = await recordShadowSignals(WATCHLIST);

  // Step 3: Generate learning report
  const accuracy = loadAccuracy();
  const report   = generateLearningReport(accuracy, brain);

  console.log('\n📋 LEARNING REPORT:');
  console.log(`  Total evaluated: ${report.totalEvaluated}`);
  console.log(`  Overall accuracy: ${report.overallAccuracy}`);
  console.log(`  Best indicator:  ${report.bestIndicator}`);
  console.log(`  Worst indicator: ${report.worstIndicator}`);
  console.log(`  Best regime:     ${report.bestRegime}`);
  console.log(`  Best hour:       ${report.bestTradingHour}`);
  console.log(`  💡 ${report.recommendation}`);

  return { ...evalResults, recorded, report };
}

// Run standalone
if (require.main === module) {
  runShadowLearning()
    .then(r => { console.log('\n✅ Shadow learning cycle complete'); process.exit(0); })
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { runShadowLearning, recordShadowSignals, evaluatePastPredictions, generateLearningReport };
