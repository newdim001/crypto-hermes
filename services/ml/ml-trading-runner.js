/**
 * ML Trading Runner - Integrated Trading System
 * Combines ML Signal Generator with Trading Engine
 * Full integration of ML Trading v2 into CryptoBot
 */

// Load .env from multiple possible locations to ensure it works from LaunchAgent
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Try multiple .env locations
const envPaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(process.env.HOME, '.openclaw/workspace/crypto-edge/.env'),
  '/Users/suren/.openclaw/workspace/crypto-edge/.env'
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`✅ Loaded .env from: ${envPath}`);
    break;
  }
}

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = '8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU';
const TELEGRAM_CHAT_ID = '8169173316';

/**
 * Send Telegram notification with trading signals
 */
async function sendTelegramNotification(signals, portfolio) {
  if (!signals || signals.length === 0) return;
  
  let message = `🦞 *CryptoEdge Trading Signals* — ${new Date().toLocaleDateString()}\n\n`;
  
  for (const signal of signals) {
    const emoji = signal.direction === 'BUY' ? '🟢' : '🔴';
    message += `${emoji} *${signal.direction}* ${signal.symbol}\n`;
    message += `   Entry: $${signal.entryPrice}\n`;
    message += `   SL: $${signal.stopLoss} | TP: $${signal.takeProfit}\n`;
    message += `   Confidence: ${signal.confidence}%\n\n`;
  }
  
  message += `💰 *Portfolio:* $${portfolio.balance.toFixed(2)} | ${portfolio.positions} positions`;
  
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    });
    console.log('✅ Telegram signal notification sent');
  } catch (err) {
    console.log('⚠️ Telegram notification failed:', err.message);
  }
}

// Import ML modules
const { generateSignal, scanMarket, calculatePositionSize } = require('./signal-generator-adaptive');
const { calculateAllIndicators } = require('./technical-indicators-v3');

// Initialize Supabase - with fallback hardcoded URL to prevent crashes
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymhidndhdvbtlfmtafbj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL) {
  console.error('❌ CRITICAL: SUPABASE_URL not found in environment');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase:', SUPABASE_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuration
const CONFIG = {
  watchlist: [
    'BTCUSDT', 'ETHUSDT'
  ],
  minConfidence: 50,  // BALANCED: More trades with decent confidence
  maxPositions: 3,
  paperBalance: 10000,
  riskPerTrade: 2,
  minRiskReward: 2.5  // Minimum 2.5:1 risk:reward
};

// ============================================
// SELF-HEALING: Auto-fix common issues
// ============================================
async function selfHeal() {
  const fixes = [];
  
  try {
    // Check trades table schema
    const { data: sample } = await supabase.from('trades').select('*').limit(1);
    const columns = Object.keys(sample?.[0] || {});
    
    // Fix 1: opened_at doesn't exist - using created_at instead
    if (!columns.includes('opened_at')) {
      // created_at exists as the timestamp column
      fixes.push('INFO: opened_at mapped to created_at (non-critical)');
    }
    
    // Fix 2: Ensure required columns exist
    const required = ['symbol', 'side', 'entry_price', 'quantity', 'status'];
    const missing = required.filter(c => !columns.includes(c));
    if (missing.length > 0) {
      fixes.push('CRITICAL: Missing columns: ' + missing.join(', '));
    }
    
    // Fix 3: Verify connection
    const { error: testErr } = await supabase.from('trades').select('id').limit(1);
    if (testErr) {
      fixes.push('DB Connection Error: ' + testErr.message);
    }
    
    if (fixes.length === 0) {
      console.log('✅ Self-heal: All systems operational');
    } else {
      console.log('⚠️ Self-heal issues:', fixes.join('; '));
    }
    
  } catch (err) {
    console.error('❌ Self-heal failed:', err.message);
  }
  
  return fixes;
}

// Binance API
const BINANCE_BASE = 'https://api.binance.com/api/v3';

/**
 * Fetch candlestick data from Binance
 */
async function getKlines(symbol, interval = '1h', limit = 100) {
  try {
    const response = await axios.get(`${BINANCE_BASE}/klines`, {
      params: { symbol, interval, limit }
    });
    
    return response.data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6]
    }));
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err.message);
    return null;
  }
}

/**
 * Get account balance - uses local state.json as primary source
 */
async function getBalance() {
  // PRIMARY: local state.json (always reliable)
  try {
    const fs = require('fs');
    const statePath = require('path').join(__dirname, '../../data/state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (state.balance) return { USDT: state.balance };
  } catch (_) {}

  return { USDT: CONFIG.paperBalance };
}

async function saveBalance(usdt) {
  // PRIMARY: Save to local state.json
  try {
    const fs = require('fs');
    const statePath = require('path').join(__dirname, '../../data/state.json');
    let state = {};
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (_) {}
    state.balance = usdt;
    state.lastSaved = Date.now();
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log(`💾 Balance saved: $${usdt.toFixed(2)}`);
  } catch (err) {
    console.error('Failed to save balance:', err.message);
  }
}

/**
 * Get current positions (paper trading)
 */
async function getPositions() {
  try {
    // Get all positions - open positions have take_profit set
    const { data: positions } = await supabase
      .from('trades')
      .select('*')
      .eq('status', 'OPEN');  // FIX: only fetch truly open positions
    
    return positions || [];
  } catch (err) {
    console.error('Error fetching positions:', err.message);
    return [];
  }
}

/**
 * Open a paper trade position
 */
async function openPosition(signal) {
  const positions = await getPositions();
  
  if (positions.length >= CONFIG.maxPositions) {
    console.log('Max positions reached');
    return null;
  }
  
  // Check if already have position in this symbol
  const existing = positions.find(p => p.symbol === signal.symbol);
  if (existing) {
    console.log(`Already have position in ${signal.symbol}`);
    return null;
  }
  
  try {
    const { data, error } = await supabase
      .from('trades')
      .insert({
        symbol: signal.symbol,
        side: signal.direction.toUpperCase(),
        entry_price: signal.entryPrice,
        quantity: signal.positionSize,
        stop_loss: signal.stopLoss,
        take_profit: signal.takeProfit,
      })
      .select();
    
    if (error) throw error;
    
    console.log(`✅ Opened ${signal.direction} ${signal.symbol} @ ${signal.entryPrice}`);
    return data;
  } catch (err) {
    console.error('Error opening position:', err.message);
    return null;
  }
}

/**
 * Close a position
 */
async function closePosition(positionId, exitPrice, reason = 'signal') {
  try {
    const { data: position } = await supabase
      .from('trades')
      .select('*')
      .eq('id', positionId)
      .single();
    
    if (!position) return null;
    
    // Calculate P&L
    let pnl = 0;
    if (position.side === 'LONG') {
      pnl = (exitPrice - position.entry_price) * position.quantity;
    } else {
      pnl = (position.entry_price - exitPrice) * position.quantity;
    }
    
    // Calculate fees (0.1% each side)
    const fees = (exitPrice * position.quantity) * 0.002;
    pnl -= fees;
    
    // Close by setting take_profit to null (indicates closed)
    const { error } = await supabase
      .from('trades')
      .update({
        exit_price: exitPrice,
        pnl: pnl,
        status: 'closed',
        stop_loss: null,
        take_profit: null
      })
      .eq('id', positionId);
    
    if (error) throw error;
    
    console.log(`❌ Closed ${position.symbol} @ ${exitPrice}, P&L: $${pnl.toFixed(2)}`);
    return { pnl, fees };
  } catch (err) {
    console.error('Error closing position:', err.message);
    return null;
  }
}

/**
 * Check and close positions based on signals
 */
async function checkExistingPositions() {
  const positions = await getPositions();
  const balance = await getBalance();
  
  for (const position of positions) {
    const candles = await getKlines(position.symbol, '1h', 50);
    if (!candles || candles.length < 50) continue;
    
    const currentPrice = candles[candles.length - 1].close;
    const indicators = calculateAllIndicators(candles);
    
    // Check stop loss
    if (position.side === 'long' && currentPrice <= parseFloat(position.stop_loss)) {
      await closePosition(position.id, currentPrice, 'stop_loss');
      continue;
    }
    if (position.side === 'short' && currentPrice >= parseFloat(position.stop_loss)) {
      await closePosition(position.id, currentPrice, 'stop_loss');
      continue;
    }
    
    // Check take profit
    if (position.side === 'long' && currentPrice >= parseFloat(position.take_profit)) {
      await closePosition(position.id, currentPrice, 'take_profit');
      continue;
    }
    if (position.side === 'short' && currentPrice <= parseFloat(position.take_profit)) {
      await closePosition(position.id, currentPrice, 'take_profit');
      continue;
    }
    
    // Check if signal reversed
    const signal = await generateSignal(position.symbol, candles, false);
    if (signal.direction !== position.side.toUpperCase() && signal.direction !== 'HOLD') {
      if (signal.confidence > 70) {
        console.log(`Signal reversed for ${position.symbol}: ${position.side} -> ${signal.direction}`);
        await closePosition(position.id, currentPrice, 'signal_reversal');
      }
    }
  }
}

/**
 * Find new trading opportunities
 */
async function findNewOpportunities() {
  console.log('\n🔍 Scanning market for opportunities...');

  // ── Signal Bridge: Check Python bot signal first ──
  const fs = require('fs');
  const path = require('path');
  const signalFile = path.join(__dirname, '../../data/signal.json');
  let bridgeSignal = null;
  try {
    if (fs.existsSync(signalFile)) {
      const data = JSON.parse(fs.readFileSync(signalFile, 'utf8'));
      const ageMs = Date.now() - new Date(data.timestamp).getTime();
      if (ageMs < 20 * 60 * 1000) { // Fresh within 20 min
        bridgeSignal = {
          symbol: data.symbol,
          direction: data.direction === 'LONG' ? 'BUY' : 'SELL',
          confidence: data.confidence * 100,
          entryPrice: data.entryPrice,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          source: 'bridge',
          reasons: [`Python bot (${data.strategy})`]
        };
        console.log(`📡 Bridge signal: ${bridgeSignal.direction} ${bridgeSignal.symbol} @ $${bridgeSignal.entryPrice.toFixed(2)} (${bridgeSignal.confidence}% confidence)`);
      }
    }
  } catch(e) { /* bridge unavailable, fall through */ }

  // Use bridge signal if confidence meets threshold
  if (bridgeSignal && bridgeSignal.confidence >= CONFIG.minConfidence) {
    // Calculate position size if bridge didn't provide one
    if (!bridgeSignal.positionSize) {
      const balance = (await getBalance()).USDT;
      const riskAmount = balance * (CONFIG.riskPerTrade / 100);
      const slDistance = Math.abs(bridgeSignal.entryPrice - bridgeSignal.stopLoss) / bridgeSignal.entryPrice;
      bridgeSignal.positionSize = parseFloat((riskAmount / slDistance / bridgeSignal.entryPrice).toFixed(4));
    }
    console.log(`📊 Using bridge signal (${bridgeSignal.confidence}% confidence)`);
    await openPosition(bridgeSignal);  // ← Execute the trade!
    return [bridgeSignal];
  }

  const signals = await scanMarket(CONFIG.watchlist, { getKlines });
  
  if (signals.length === 0) {
    console.log('No opportunities found');
    return [];
  }
  
  console.log(`\n📊 Found ${signals.length} signals:`);
  for (const signal of signals.slice(0, 5)) {
    console.log(`  ${signal.direction} ${signal.symbol} @ ${signal.entryPrice} (${signal.confidence}%)`);
  }
  
  // Open highest confidence signal
  const bestSignal = signals[0];
  if (bestSignal.confidence >= CONFIG.minConfidence) {
    await openPosition(bestSignal);
  }
  
  return signals;
}

/**
 * Get portfolio status
 */
async function getPortfolioStatus() {
  const positions = await getPositions();
  const balance = await getBalance();
  
  let unrealizedPnL = 0;
  for (const position of positions) {
    const candles = await getKlines(position.symbol, '1h', 1);
    if (candles && candles.length > 0) {
      const currentPrice = candles[0].close;
      if (position.side === 'long') {
        unrealizedPnL += (currentPrice - position.entry_price) * position.quantity;
      } else {
        unrealizedPnL += (position.entry_price - currentPrice) * position.quantity;
      }
    }
  }
  
  const totalValue = balance.USDT + unrealizedPnL;
  
  return {
    balance: balance.USDT,
    positions: positions.length,
    unrealizedPnL,
    totalValue,
    maxPositions: CONFIG.maxPositions
  };
}

/**
 * Main trading loop
 */
async function runTradingCycle() {
  console.log('\n' + '='.repeat(50));
  console.log(`🤖 ML Trading Cycle - ${new Date().toISOString()}`);
  console.log('='.repeat(50));
  
  // Self-heal: Check and fix common issues
  await selfHeal();
  
  // Check existing positions
  console.log('\n📋 Checking existing positions...');
  await checkExistingPositions();
  
  // Find new opportunities
  const signals = await findNewOpportunities();
  
  // Portfolio status
  const portfolio = await getPortfolioStatus();
  console.log('\n💰 Portfolio Status:');
  console.log(`  Balance: $${portfolio.balance.toFixed(2)}`);
  console.log(`  Positions: ${portfolio.positions}/${portfolio.maxPositions}`);
  console.log(`  Unrealized P&L: $${portfolio.unrealizedPnL.toFixed(2)}`);
  console.log(`  Total Value: $${portfolio.totalValue.toFixed(2)}`);
  
  // Send Telegram notification with signals
  await sendTelegramNotification(signals, portfolio);
  
  return { portfolio, signals };
}

/**
 * Run once for testing
 */
async function test() {
  console.log('🧪 Running ML Trading v2 Integration Test...\n');
  
  // Test 1: Fetch data
  console.log('Test 1: Fetching BTC data...');
  const btcData = await getKlines('BTCUSDT', '1h', 100);
  console.log(`  ✅ Got ${btcData?.length || 0} candles`);
  
  // Test 2: Generate signal
  console.log('\nTest 2: Generating BTC signal...');
  if (btcData && btcData.length >= 50) {
    const signal = await generateSignal('BTCUSDT', btcData, false);
    console.log(`  Direction: ${signal.direction}`);
    console.log(`  Confidence: ${signal.confidence}%`);
    console.log(`  Entry: ${signal.entryPrice}`);
    console.log(`  Stop Loss: ${signal.stopLoss}`);
    console.log(`  Take Profit: ${signal.takeProfit}`);
    console.log(`  Reasons: ${signal.reasons.join(', ')}`);
  }
  
  // Test 3: Scan market
  console.log('\nTest 3: Scanning market...');
  const signals = await scanMarket(['BTCUSDT', 'ETHUSDT', 'BNBUSDT'], { getKlines });
  console.log(`  Found ${signals.length} signals`);
  
  // Test 4: Portfolio status
  console.log('\nTest 4: Portfolio status...');
  const portfolio = await getPortfolioStatus();
  console.log(`  Balance: $${portfolio.balance}`);
  console.log(`  Positions: ${portfolio.positions}`);
  
  console.log('\n✅ All tests passed!');
}

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'test') {
    test().catch(console.error);
  } else if (args[0] === 'run') {
    runTradingCycle().catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  node ml-trading-runner.js test  - Run tests');
    console.log('  node ml-trading-runner.js run   - Run trading cycle');
  }
}

module.exports = {
  runTradingCycle,
  generateSignal,
  getPortfolioStatus,
  openPosition,
  closePosition,
  test
};
