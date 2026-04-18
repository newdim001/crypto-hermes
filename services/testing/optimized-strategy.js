/**
 * Optimized Multi-Signal Strategy
 * Combines: Trend Filter + RSI + MACD + Volume + Bollinger
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '../../data/market');

async function loadData(symbol, interval) {
  const file = path.join(DATA_DIR, `${symbol}_${interval}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file)).data;
  }
  return null;
}

// Technical indicators
function sma(data, period) {
  if (data.length < period) return data[data.length - 1];
  return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function ema(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function rsi(data, period = 14) {
  if (data.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

function macd(data) {
  const e12 = ema(data, 12);
  const e26 = ema(data, 26);
  return { macd: e12 - e26, signal: (e12 - e26) * 0.9 };
}

function bollinger(data, period = 20) {
  const m = sma(data, period);
  const slice = data.slice(-period);
  const v = slice.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / period;
  return { upper: m + 2 * Math.sqrt(v), middle: m, lower: m - 2 * Math.sqrt(v) };
}

function adx(highs, lows, closes, period = 14) {
  if (highs.length < period) return 20;
  let plusDM = 0, minusDM = 0, tr = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const h = highs[i], l = lows[i], c = closes[i], pc = closes[i-1];
    const hr = h - highs[i-1], lr = lows[i-1] - l;
    plusDM += hr > lr && hr > 0 ? hr : 0;
    minusDM += lr > hr && lr > 0 ? lr : 0;
    tr += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const plusDI = (plusDM / tr) * 100;
  const minusDI = (minusDM / tr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  return dx;
}

// Generate signals
function generateSignal(candles) {
  if (candles.length < 50) return { signal: 0, confidence: 0 };
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  
  // 1. Trend filter (200 SMA)
  const ma200 = sma(closes, 200);
  const ma50 = sma(closes, 50);
  const trendUp = current > ma200 && ma50 > ma200;
  const trendDown = current < ma200 && ma50 < ma200;
  
  // 2. RSI (mean reversion)
  const rsiVal = rsi(closes, 14);
  const rsiOversold = rsiVal < 35;
  const rsiOverbought = rsiVal > 65;
  
  // 3. MACD (momentum)
  const macdVal = macd(closes);
  const macdBullish = macdVal.macd > macdVal.signal;
  const macdBearish = macdVal.macd < macdVal.signal;
  
  // 4. Bollinger Bands
  const bb = bollinger(closes, 20);
  const atLower = current < bb.lower;
  const atUpper = current > bb.upper;
  
  // 5. Volume confirmation
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volSpike = volumes[volumes.length - 1] > avgVol * 1.5;
  
  // Combine signals with regime awareness
  let buyScore = 0, sellScore = 0;
  
  if (trendUp) { buyScore += 2; }
  if (trendDown) { sellScore += 2; }
  if (rsiOversold) { buyScore += 2; }
  if (rsiOverbought) { sellScore += 2; }
  if (macdBullish) { buyScore += 1; }
  if (macdBearish) { sellScore += 1; }
  if (atLower && volSpike) { buyScore += 2; }
  if (atUpper && volSpike) { sellScore += 2; }
  
  const total = buyScore + sellScore;
  const confidence = total > 0 ? Math.min(total / 10, 1) : 0;
  
  // Signal
  let signal = 0;
  if (buyScore > sellScore + 2) signal = 1;
  else if (sellScore > buyScore + 2) signal = -1;
  
  // In uncertain regime, stay out
  if (trendUp && trendDown) signal = 0;
  
  return { signal, confidence, buyScore, sellScore, rsi: rsiVal, trend: trendUp ? 'UP' : trendDown ? 'DOWN' : 'FLAT' };
}

// Backtest optimized strategy
async function backtestOptimized(symbol = 'BTCUSDT', interval = '1h') {
  console.log(`\n🔄 Optimized Strategy Backtest: ${symbol} ${interval}`);
  
  const candles = await loadData(symbol, interval);
  if (!candles || candles.length < 200) {
    console.log('❌ Not enough data');
    return;
  }
  
  const initialBalance = 10000;
  let balance = initialBalance;
  let position = 0;
  let entryPrice = 0;
  const trades = [];
  const commission = 0.001;
  const slippage = 0.0005;
  
  for (let i = 200; i < candles.length; i++) {
    const candleSlice = candles.slice(0, i + 1);
    const { signal, confidence } = generateSignal(candleSlice);
    const price = candles[i].close;
    
    // Buy
    if (signal === 1 && confidence > 0.5 && position === 0) {
      const buyPrice = price * (1 + slippage);
      const size = (balance * 0.1) / buyPrice; // 10% position
      position = size;
      balance -= size * buyPrice;
      entryPrice = buyPrice;
      trades.push({ type: 'BUY', price: buyPrice, time: candles[i].time, rsi: generateSignal(candleSlice).rsi });
    }
    
    // Sell
    else if ((signal === -1 || confidence > 0.8) && position > 0) {
      const sellPrice = price * (1 - slippage);
      const proceeds = position * sellPrice * (1 - commission);
      const pnl = proceeds - (position * entryPrice);
      balance += proceeds;
      trades.push({ type: 'SELL', price: sellPrice, time: candles[i].time, pnl, rsi: generateSignal(candleSlice).rsi });
      position = 0;
      entryPrice = 0;
    }
  }
  
  // Close position
  if (position > 0) {
    balance += position * candles[candles.length - 1].close;
  }
  
  const closedTrades = trades.filter(t => t.type === 'SELL');
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl < 0);
  const returnPct = ((balance - initialBalance) / initialBalance) * 100;
  
  console.log('\n📊 OPTIMIZED STRATEGY RESULTS:');
  console.log('='.repeat(45));
  console.log(`Initial Balance:  $${initialBalance}`);
  console.log(`Final Balance:    $${balance.toFixed(2)}`);
  console.log(`Return:           ${returnPct.toFixed(2)}%`);
  console.log(`Total Trades:     ${closedTrades.length}`);
  console.log(`Win Rate:         ${closedTrades.length ? (wins.length / closedTrades.length * 100).toFixed(1) : 0}%`);
  console.log(`Wins:             ${wins.length}`);
  console.log(`Losses:           ${losses.length}`);
  
  return { balance, return: returnPct, trades: closedTrades.length, winRate: wins.length / closedTrades.length };
}

// Run for all symbols
async function runAll() {
  console.log('🎯 OPTIMIZED MULTI-SIGNAL STRATEGY BACKTEST\n');
  
  const results = [];
  
  for (const sym of ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']) {
    const r = await backtestOptimized(sym, '1h');
    if (r) results.push({ symbol: sym, ...r });
  }
  
  console.log('\n📈 SUMMARY ALL PAIRS:');
  console.log('='.repeat(45));
  results.forEach(r => {
    console.log(`${r.symbol.padEnd(10)} Return: ${r.return.toFixed(2).padStart(8)}%  Trades: ${r.trades}  Win: ${(r.winRate*100).toFixed(0)}%`);
  });
  
  const avgReturn = results.reduce((s, r) => s + r.return, 0) / results.length;
  console.log('─'.repeat(45));
  console.log(`Average Return:   ${avgReturn.toFixed(2)}%`);
}

runAll();
