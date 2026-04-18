// Simple test to check bridge integration
const fs = require('fs');
const path = require('path');

const SIGNAL_FILE = path.join(__dirname, './data/signal.json');

console.log('🧪 Testing bridge signal reading...');

if (fs.existsSync(SIGNAL_FILE)) {
  const signal = JSON.parse(fs.readFileSync(SIGNAL_FILE, 'utf8'));
  console.log('✅ Bridge signal found:', {
    symbol: signal.symbol,
    confidence: signal.confidence,
    price: signal.entryPrice,
    direction: signal.direction
  });
  
  // Check if confidence meets threshold (60%)
  if (signal.confidence >= 0.60) {
    console.log('🎯 Signal meets threshold (≥60%) - SHOULD TRADE');
  } else {
    console.log('⚠️ Signal below threshold - NO TRADE');
  }
} else {
  console.log('❌ No bridge signal file found');
}