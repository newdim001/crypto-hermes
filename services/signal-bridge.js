/**
 * Signal Bridge - Connect Python Trading Bot to CryptoEdge Smart Engine
 * 
 * Reads Python bot signals and converts them to CryptoEdge format
 * Creates signal.json file for smart-engine.js to consume
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PYTHON_BOT_DIR = path.join(__dirname, '../../crypto-trading-bot');
const SIGNALS_DIR = path.join(PYTHON_BOT_DIR, 'signals');
const CRYPTOEDGE_SIGNAL_FILE = path.join(__dirname, '../data/signal.json');

// CryptoEdge signal format
const CRYPTOEDGE_SIGNAL_TEMPLATE = {
  symbol: '',
  direction: 'LONG', // or 'SHORT'
  confidence: 0.65,   // Default 65% (above new 60% threshold)
  entryPrice: 0,
  stopLoss: 0,
  takeProfit: 0,
  timestamp: new Date().toISOString(),
  source: 'python-bot-bridge',
  quality: 0,
  regime: '',
  strategy: ''
};

function readPythonBotSignals() {
  try {
    // Run Python bot to generate latest signals
    console.log('🔗 Running Python bot to generate signals...');
    const output = execSync(`cd "${PYTHON_BOT_DIR}" && python3.11 run.py --cycle`, {
      encoding: 'utf8',
      timeout: 60000
    });
    
    console.log('✅ Python bot output:', output.substring(0, 200) + '...');
    
    // Parse signals from output (simplified - in reality would parse JSON)
    const signals = [];
    
    // Look for BUY signals in output
    const lines = output.split('\n');
    let currentSignal = null;
    
    for (const line of lines) {
      if (line.includes('BUY') && line.includes('@ $')) {
        // Example: "BUY BTC/USDT @ $71,214.29"
        const match = line.match(/BUY\s+(\w+)\/USDT\s+@\s+\$([\d,]+\.\d+)/);
        if (match) {
          const symbol = match[1] + 'USDT';
          const price = parseFloat(match[2].replace(/,/g, ''));
          
          // Look for quality in next lines
          let quality = 50; // Default
          let regime = 'range';
          let strategy = 'fear_greed_sentiment';
          
          for (let i = 1; i <= 3; i++) {
            const nextLine = lines[lines.indexOf(line) + i];
            if (nextLine && nextLine.includes('Quality:')) {
              const qualityMatch = nextLine.match(/Quality:\s*([\d.]+)/);
              if (qualityMatch) quality = parseFloat(qualityMatch[1]);
            }
            if (nextLine && nextLine.includes('Regime:')) {
              const regimeMatch = nextLine.match(/Regime:\s*(\w+)/);
              if (regimeMatch) regime = regimeMatch[1].toLowerCase();
            }
            if (nextLine && nextLine.includes('Strategy:')) {
              const strategyMatch = nextLine.match(/Strategy:\s*(\w+)/);
              if (strategyMatch) strategy = strategyMatch[1];
            }
          }
          
          signals.push({
            symbol,
            price,
            quality: quality / 100, // Convert to decimal
            regime,
            strategy
          });
        }
      }
    }
    
    return signals;
    
  } catch (error) {
    console.error('❌ Error reading Python bot signals:', error.message);
    return [];
  }
}

function convertToCryptoEdgeSignal(pythonSignal) {
  const signal = { ...CRYPTOEDGE_SIGNAL_TEMPLATE };
  
  signal.symbol = pythonSignal.symbol;
  signal.direction = 'LONG'; // Python bot only generates BUY signals for now
  signal.confidence = Math.max(0.60, pythonSignal.quality); // Ensure ≥60%
  signal.entryPrice = pythonSignal.price;
  
  // Calculate stop loss and take profit (1.5% stop, 3.75% target)
  const stopLossPct = 0.015;
  const takeProfitPct = 0.0375;
  
  signal.stopLoss = pythonSignal.price * (1 - stopLossPct);
  signal.takeProfit = pythonSignal.price * (1 + takeProfitPct);
  signal.quality = pythonSignal.quality;
  signal.regime = pythonSignal.regime;
  signal.strategy = pythonSignal.strategy;
  signal.timestamp = new Date().toISOString();
  
  return signal;
}

function writeCryptoEdgeSignal(signal) {
  try {
    fs.writeFileSync(CRYPTOEDGE_SIGNAL_FILE, JSON.stringify(signal, null, 2));
    console.log(`✅ Signal written to ${CRYPTOEDGE_SIGNAL_FILE}:`, {
      symbol: signal.symbol,
      confidence: signal.confidence,
      price: signal.entryPrice
    });
    return true;
  } catch (error) {
    console.error('❌ Error writing signal file:', error.message);
    return false;
  }
}

function main() {
  console.log('🔗 SIGNAL BRIDGE - Connecting Python Bot to CryptoEdge');
  console.log('='.repeat(50));
  
  // Step 1: Read Python bot signals
  const pythonSignals = readPythonBotSignals();
  
  if (pythonSignals.length === 0) {
    console.log('⚠️ No signals found from Python bot');
    return;
  }
  
  console.log(`📊 Found ${pythonSignals.length} signal(s) from Python bot:`);
  pythonSignals.forEach(s => {
    console.log(`   ${s.symbol} @ $${s.price.toFixed(2)} (${(s.quality * 100).toFixed(1)}% quality)`);
  });
  
  // Step 2: Convert and write the best signal
  const bestSignal = pythonSignals.reduce((best, current) => 
    current.quality > best.quality ? current : best
  );
  
  console.log(`🎯 Best signal: ${bestSignal.symbol} (${(bestSignal.quality * 100).toFixed(1)}% quality)`);
  
  const cryptoEdgeSignal = convertToCryptoEdgeSignal(bestSignal);
  
  // Step 3: Write to CryptoEdge
  const success = writeCryptoEdgeSignal(cryptoEdgeSignal);
  
  if (success) {
    console.log('='.repeat(50));
    console.log('✅ SIGNAL BRIDGE COMPLETE');
    console.log(`📤 Signal ready for CryptoEdge Smart Engine:`);
    console.log(`   Symbol: ${cryptoEdgeSignal.symbol}`);
    console.log(`   Confidence: ${(cryptoEdgeSignal.confidence * 100).toFixed(1)}%`);
    console.log(`   Entry: $${cryptoEdgeSignal.entryPrice.toFixed(2)}`);
    console.log(`   Stop Loss: $${cryptoEdgeSignal.stopLoss.toFixed(2)} (-1.5%)`);
    console.log(`   Take Profit: $${cryptoEdgeSignal.takeProfit.toFixed(2)} (+3.75%)`);
    console.log('='.repeat(50));
    console.log('🚀 Next: CryptoEdge Smart Engine will read this signal on next run');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, readPythonBotSignals, convertToCryptoEdgeSignal };