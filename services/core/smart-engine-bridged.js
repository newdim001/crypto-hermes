/**
 * Smart Engine BRIDGED - Reads signals from Python bot bridge
 * Modified version that checks signal.json first
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Import the original smart engine but override signal generation
const originalSmartEngine = require('./smart-engine.js');

// Signal bridge integration
const SIGNAL_FILE = path.join(__dirname, '../../data/signal.json');

function readBridgeSignal() {
  try {
    if (fs.existsSync(SIGNAL_FILE)) {
      const signalData = JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8'));
      console.log(`📡 BRIDGE SIGNAL FOUND: ${signalData.symbol} @ $${signalData.entryPrice.toFixed(2)} (${(signalData.confidence * 100).toFixed(1)}% confidence)`);
      return signalData;
    }
  } catch (error) {
    console.log('📡 No bridge signal found or error reading:', error.message);
  }
  return null;
}

// Override the signal generation in the original engine
async function generatePrincipledSignalWithBridge(symbol, brain) {
  // First check if we have a bridge signal for this symbol
  const bridgeSignal = readBridgeSignal();
  
  if (bridgeSignal && bridgeSignal.symbol === symbol) {
    console.log(`🎯 USING BRIDGE SIGNAL for ${symbol}`);
    
    return {
      direction: bridgeSignal.direction,
      confidence: bridgeSignal.confidence * 100, // Convert to percentage
      currentPrice: bridgeSignal.entryPrice,
      indicators: {
        rsi: 50, // Placeholder - bridge doesn't provide indicators
        volRatio: 1.0,
        trend: bridgeSignal.regime.toUpperCase() === 'TRENDING' ? 'BULLISH' : 'NEUTRAL'
      },
      indicatorsSnapshot: {
        rsiSignal: 'triggered',
        volumeSignal: 'triggered'
      },
      source: 'bridge',
      bridgeData: bridgeSignal
    };
  }
  
  // Fall back to original signal generation
  return originalSmartEngine.generatePrincipledSignal(symbol, brain);
}

// Create a wrapped version of the main function
async function runBridgedEngine() {
  console.log('🚀 SMART ENGINE BRIDGED - Python Bot Integration Active');
  console.log('='.repeat(60));
  
  // Check for bridge signals first
  const bridgeSignal = readBridgeSignal();
  if (bridgeSignal) {
    console.log(`📊 Bridge Signal Details:`);
    console.log(`   Symbol: ${bridgeSignal.symbol}`);
    console.log(`   Direction: ${bridgeSignal.direction}`);
    console.log(`   Confidence: ${(bridgeSignal.confidence * 100).toFixed(1)}%`);
    console.log(`   Entry: $${bridgeSignal.entryPrice.toFixed(2)}`);
    console.log(`   Quality: ${(bridgeSignal.quality * 100).toFixed(1)}%`);
    console.log(`   Regime: ${bridgeSignal.regime}`);
    console.log(`   Strategy: ${bridgeSignal.strategy}`);
    console.log('='.repeat(60));
  }
  
  // Run the original engine with our bridge integration
  // We need to monkey-patch the signal generation
  const originalGenerate = originalSmartEngine.generatePrincipledSignal;
  originalSmartEngine.generatePrincipledSignal = generatePrincipledSignalWithBridge;
  
  try {
    // Call the original runSmartEngine function
    if (typeof originalSmartEngine.runSmartEngine === 'function') {
      return await originalSmartEngine.runSmartEngine();
    } else {
      console.log('⚠️ Original engine does not have runSmartEngine method');
      // Try to run it directly
      return await originalSmartEngine();
    }
  } finally {
    // Restore original function
    originalSmartEngine.generatePrincipledSignal = originalGenerate;
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--test-bridge')) {
    console.log('🧪 Testing bridge integration...');
    const signal = readBridgeSignal();
    if (signal) {
      console.log('✅ Bridge signal found:', signal);
    } else {
      console.log('❌ No bridge signal found');
    }
    process.exit(0);
  }
  
  if (args.includes('--run-bridge')) {
    console.log('🚀 Running bridged engine...');
    
    // First, run the signal bridge to get latest Python bot signals
    const { execSync } = require('child_process');
    try {
      console.log('🔗 Running signal bridge...');
      execSync('node ../signal-bridge.js', {
        cwd: __dirname,
        stdio: 'inherit',
        timeout: 30000
      });
    } catch (error) {
      console.log('⚠️ Signal bridge error (may be okay if no signals):', error.message);
    }
    
    // Then run the bridged engine
    runBridgedEngine().then(result => {
      console.log('✅ Bridged engine completed:', result);
      process.exit(0);
    }).catch(error => {
      console.error('❌ Bridged engine error:', error);
      process.exit(1);
    });
  } else {
    // Default: just run the bridged engine
    runBridgedEngine().catch(console.error);
  }
}

module.exports = {
  runBridgedEngine,
  readBridgeSignal,
  generatePrincipledSignalWithBridge
};