/**
 * Shadow Learning Runner
 * Runs the shadow learning system
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');
const ShadowLearning = require('./shadow-learning');

const CONFIG = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'],
  scanInterval: 60 * 60 * 1000, // 1 hour
  evaluateInterval: 15 * 60 * 1000, // 15 minutes
  learningCheckInterval: 4 * 60 * 60 * 1000 // 4 hours
};

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'run';
  
  const learner = new ShadowLearning();
  
  if (action === 'status') {
    const status = learner.getStatus();
    console.log('\n📊 SHADOW LEARNING STATUS');
    console.log('═══════════════════════════');
    console.log('Total Signals:', status.totalSignals);
    console.log('Evaluated:', status.evaluated);
    console.log('Pending:', status.pending);
    console.log('Overall Accuracy:', status.accuracy + '%');
    console.log('Recent Accuracy (50):', status.recentAccuracy + '%');
    console.log('Brain Version:', status.brainVersion);
    console.log('Last Brain Update:', status.lastUpdated || 'Never');
    console.log('Should Switch to Live:', status.shouldLive ? 'YES ✅' : 'NO ❌');
    console.log('═══════════════════════════\n');
    return;
  }
  
  if (action === 'learn') {
    console.log('🧠 Running learning cycle...');
    const result = learner.learn();
    console.log('Learning result:', result);
    return;
  }
  
  if (action === 'generate') {
    console.log('📊 Generating shadow signals...');
    await generateShadowSignals(learner);
    return;
  }
  
  if (action === 'evaluate') {
    console.log('📊 Evaluating shadow signals...');
    await evaluateShadowSignals(learner);
    return;
  }
  
  if (action === 'decision') {
    const decision = learner.shouldSwitchToLive();
    console.log('Decision:', decision);
    return;
  }
  
  // Full run cycle
  console.log('🚀 Shadow Learning Runner Starting...\n');
  
  // 1. Generate new shadow signals
  console.log('📊 Step 1: Generating shadow signals...');
  await generateShadowSignals(learner);
  
  // 2. Evaluate expired signals
  console.log('📊 Step 2: Evaluating expired signals...');
  await evaluateShadowSignals(learner);
  
  // 3. Check if we should learn
  console.log('📊 Step 3: Checking learning...');
  const learnResult = learner.learn();
  
  // 4. Decision on live trading
  console.log('📊 Step 4: Trading decision...');
  const decision = learner.shouldSwitchToLive();
  
  // 5. Print status
  const status = learner.getStatus();
  console.log('\n📊 FINAL STATUS:');
  console.log('   Signals:', status.totalSignals, '| Accuracy:', status.accuracy + '%');
  console.log('   Should Live:', decision.shouldSwitch ? 'YES ✅' : 'NO ❌');
  
  if (decision.shouldSwitch) {
    console.log('\n🎉 SWITCHING TO LIVE TRADING!');
    await switchToLiveTrading();
  }
}

/**
 * Generate shadow signals for all symbols
 */
async function generateShadowSignals(learner) {
  for (const symbol of CONFIG.symbols) {
    try {
      const candles = await fetchPriceData(symbol, 100);
      if (!candles || candles.length < 50) continue;
      
      const signal = await learner.generateShadowSignal(symbol, candles);
      
      if (signal) {
        console.log(`   ${symbol}: ${signal.direction} @ ${signal.confidence}% confidence`);
      }
    } catch (err) {
      console.log(`   ${symbol}: Error - ${err.message}`);
    }
  }
}

/**
 * Evaluate shadow signals that have expired
 */
async function evaluateShadowSignals(learner) {
  const currentPrices = {};
  
  // Fetch current prices
  for (const symbol of CONFIG.symbols) {
    try {
      const candles = await fetchPriceData(symbol, 2);
      if (candles && candles.length > 0) {
        currentPrices[symbol] = candles[candles.length - 1].close;
      }
    } catch (err) {
      // Skip
    }
  }
  
  await learner.evaluateShadowSignals(currentPrices);
}

/**
 * Switch to live trading
 */
async function switchToLiveTrading() {
  console.log('🎉 Switching CryptoEdge to LIVE trading mode...');
  
  // Update state.json to switch mode
  const fs = require('fs');
  const path = require('path');
  const statePath = path.join(__dirname, '../../data/state.json');
  
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.mode = 'ml-live';
    state.modeSwitchTime = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log('✅ Switched to LIVE mode!');
  } catch (err) {
    console.log('❌ Error switching mode:', err.message);
  }
}

/**
 * Fetch price data from Binance
 */
async function fetchPriceData(symbol, limit) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: { symbol, interval: '1h', limit },
      timeout: 10000
    });
    
    return response.data.map(c => ({
      openTime: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      closeTime: c[6]
    }));
  } catch (err) {
    return null;
  }
}

// Run
main().catch(console.error);
