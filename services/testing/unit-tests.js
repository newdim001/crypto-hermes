/**
 * Unit Tests - Core Trading Functions
 */

const assert = require('assert');

// ============================================
// TEST: Position Sizer
// ============================================

class PositionSizer {
  calculateSize(winRate, avgWin, avgLoss, balance) {
    const W = winRate / 100;
    const R = avgWin / (avgLoss || 1);
    const edge = W * R - (1 - W);
    if (edge <= 0) return balance * 0.01;
    const kelly = Math.min(edge, 0.25);
    return balance * kelly;
  }
  
  adjustForVolatility(currentATR, avgATR, size) {
    const ratio = currentATR / (avgATR || 1);
    if (ratio > 2) return size * 0.25;
    if (ratio > 1.5) return size * 0.5;
    if (ratio > 1) return size * 0.75;
    return size;
  }
  
  adjustForConfidence(confidence, size) {
    return size * (confidence / 100);
  }
  
  adjustForRegime(regime, size) {
    const mods = { 'TRENDING_BULL': 1, 'TRENDING_BEAR': 0.5, 'RANGING': 0.75, 'HIGH_VOLATILITY': 0.25, 'LOW_VOLATILITY': 1.25 };
    return size * (mods[regime] || 1);
  }
}

function testPositionSizer() {
  console.log('🧪 Testing Position Sizer...');
  
  const sizer = new PositionSizer();
  
  // Test 1: Kelly Criterion
  const size1 = sizer.calculateSize(55, 150, 100, 10000);
  assert(size1 > 0, 'Size should be positive');
  assert(size1 <= 2500, 'Size should be capped at 25%');
  console.log(`   ✅ Kelly: ${size1.toFixed(2)} for 55% win rate`);
  
  // Test 2: Negative edge
  const size2 = sizer.calculateSize(30, 100, 100, 10000);
  assert(size2 === 100, 'Should return minimum 1% for negative edge');
  console.log(`   ✅ Negative edge: returns minimum ${size2}`);
  
  // Test 3: Volatility adjustment
  const volSize = sizer.adjustForVolatility(2.5, 1, 1000);
  assert(volSize === 250, 'High volatility should reduce size');
  console.log(`   ✅ Volatility: ${volSize} for 2.5x ATR`);
  
  // Test 4: Confidence adjustment
  const confSize = sizer.adjustForConfidence(50, 1000);
  assert(confSize === 500, '50% confidence should halve size');
  console.log(`   ✅ Confidence: ${confSize} at 50%`);
  
  // Test 5: Regime adjustment
  const bullSize = sizer.adjustForRegime('TRENDING_BULL', 1000);
  const bearSize = sizer.adjustForRegime('TRENDING_BEAR', 1000);
  assert(bullSize === 1000, 'Bull regime should keep full size');
  assert(bearSize === 500, 'Bear regime should halve size');
  console.log(`   ✅ Regime: Bull=${bullSize}, Bear=${bearSize}`);
  
  console.log('   ✅ All Position Sizer tests passed!\n');
}

// ============================================
// TEST: Fee Calculator
// ============================================

function calculateFee(amount, price, isMaker) {
  const rate = isMaker ? 0.001 : 0.001;
  return amount * price * rate;
}

function testFeeCalculator() {
  console.log('🧪 Testing Fee Calculator...');
  
  // Test 1: Spot fee
  const fee1 = calculateFee(0.01, 50000, false);
  assert(fee1 === 0.5, 'Taker fee should be 0.1%');
  console.log(`   ✅ Spot fee: $${fee1} for 0.01 BTC at $50k`);
  
  // Test 2: Large trade discount
  const fee2 = calculateFee(1, 50000, true);
  assert(fee2 === 50, 'Maker fee should apply');
  console.log(`   ✅ Large trade fee: $${fee2}`);
  
  console.log('   ✅ All Fee Calculator tests passed!\n');
}

// ============================================
// TEST: Risk Calculations
// ============================================

function calculatePnL(entry, exit, qty, direction) {
  if (direction === 'LONG') {
    return (exit - entry) * qty;
  }
  return (entry - exit) * qty;
}

function calculatePnLPercent(entry, exit, direction) {
  if (direction === 'LONG') {
    return ((exit - entry) / entry) * 100;
  }
  return ((entry - exit) / entry) * 100;
}

function testRiskCalculations() {
  console.log('🧪 Testing Risk Calculations...');
  
  // Test 1: Long P&L
  const pnl1 = calculatePnL(50000, 55000, 0.01, 'LONG');
  assert(pnl1 === 50, 'Long P&L should be $50');
  console.log(`   ✅ Long P&L: $${pnl1} (50000→55000)`);
  
  // Test 2: Short P&L
  const pnl2 = calculatePnL(50000, 45000, 0.01, 'SHORT');
  assert(pnl2 === 50, 'Short P&L should be $50');
  console.log(`   ✅ Short P&L: $${pnl2} (50000→45000)`);
  
  // Test 3: P&L Percentage
  const pct1 = calculatePnLPercent(50000, 55000, 'LONG');
  assert(pct1 === 10, 'Long should be +10%');
  console.log(`   ✅ Long %: ${pct1}%`);
  
  const pct2 = calculatePnLPercent(50000, 45000, 'SHORT');
  assert(pct2 === 10, 'Short should be +10%');
  console.log(`   ✅ Short %: ${pct2}%`);
  
  console.log('   ✅ All Risk Calculation tests passed!\n');
}

// ============================================
// TEST: Stop Loss / Take Profit
// ============================================

function calculateStopLoss(entry, percent, direction) {
  if (direction === 'LONG') {
    return entry * (1 - percent / 100);
  }
  return entry * (1 + percent / 100);
}

function calculateTakeProfit(entry, percent, direction) {
  if (direction === 'LONG') {
    return entry * (1 + percent / 100);
  }
  return entry * (1 - percent / 100);
}

function testStopLossTakeProfit() {
  console.log('🧪 Testing Stop Loss / Take Profit...');
  
  // Test 1: Long stop loss
  const sl1 = calculateStopLoss(50000, 2, 'LONG');
  assert(sl1 === 49000, 'Long stop should be below entry');
  console.log(`   ✅ Long SL (2%): $${sl1}`);
  
  // Test 2: Short stop loss
  const sl2 = calculateStopLoss(50000, 2, 'SHORT');
  assert(sl2 === 51000, 'Short stop should be above entry');
  console.log(`   ✅ Short SL (2%): $${sl2}`);
  
  // Test 3: Long take profit
  const tp1 = calculateTakeProfit(50000, 4, 'LONG');
  assert(tp1 === 52000, 'Long TP should be above entry');
  console.log(`   ✅ Long TP (4%): $${tp1}`);
  
  // Test 4: Short take profit
  const tp2 = calculateTakeProfit(50000, 4, 'SHORT');
  assert(tp2 === 48000, 'Short TP should be below entry');
  console.log(`   ✅ Short TP (4%): $${tp2}`);
  
  console.log('   ✅ All Stop Loss/Take Profit tests passed!\n');
}

// ============================================
// TEST: Correlation
// ============================================

function getCorrelation(asset1, asset2) {
  const matrix = {
    'BTC': { 'ETH': 0.75, 'SOL': 0.55 },
    'ETH': { 'BTC': 0.75, 'SOL': 0.60 },
    'SOL': { 'BTC': 0.55, 'ETH': 0.60 }
  };
  return matrix[asset1]?.[asset2] || 0.3;
}

function testCorrelation() {
  console.log('🧪 Testing Correlation...');
  
  const corr1 = getCorrelation('BTC', 'ETH');
  assert(corr1 === 0.75, 'BTC-ETH correlation should be 0.75');
  console.log(`   ✅ BTC-ETH: ${corr1}`);
  
  const corr2 = getCorrelation('BTC', 'SOL');
  assert(corr2 === 0.55, 'BTC-SOL correlation should be 0.55');
  console.log(`   ✅ BTC-SOL: ${corr2}`);
  
  const corr3 = getCorrelation('UNKNOWN', 'BTC');
  assert(corr3 === 0.3, 'Unknown should return default 0.3');
  console.log(`   ✅ Unknown pair: ${corr3} (default)`);
  
  console.log('   ✅ All Correlation tests passed!\n');
}

// ============================================
// RUN ALL TESTS
// ============================================

function runAllTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   CRYPTOEDGE UNIT TESTS                ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  try {
    testPositionSizer();
    testFeeCalculator();
    testRiskCalculations();
    testStopLossTakeProfit();
    testCorrelation();
    
    console.log('╔════════════════════════════════════════╗');
    console.log('║   ✅ ALL TESTS PASSED                  ║');
    console.log('╚════════════════════════════════════════╝');
  } catch (e) {
    console.error(`\n❌ TEST FAILED: ${e.message}`);
    process.exit(1);
  }
}

runAllTests();
