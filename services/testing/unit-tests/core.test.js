/**
 * Unit Tests - Core Trading Functions
 * Run: node services/testing/unit-tests/core.test.js
 */

const assert = require('assert');

// Test 1: Position Sizing
function testPositionSizing() {
  const { calculatePositionSize } = require('../risk/position-sizer');
  
  // Test Kelly Criterion
  const size = calculatePositionSize(10000, 0.5, 2);
  assert(size > 0, 'Position size should be positive');
  assert(size <= 1000, 'Position should not exceed 10% of balance');
  
  console.log('✅ Position sizing: PASS');
}

// Test 2: Data Validation
function testDataValidator() {
  const { validatePriceData } = require('../data-validator');
  
  // Valid data
  const valid = validatePriceData({ price: 50000, volume: 1000000, timestamp: Date.now() });
  assert(valid.valid === true, 'Valid data should pass');
  
  // Invalid price
  const invalidPrice = validatePriceData({ price: -100, volume: 1000000, timestamp: Date.now() });
  assert(invalidPrice.valid === false, 'Negative price should fail');
  
  // Stale data
  const stale = validatePriceData({ price: 50000, volume: 1000000, timestamp: Date.now() - 60000 });
  assert(stale.valid === false, 'Stale data should fail');
  
  console.log('✅ Data validation: PASS');
}

// Test 3: Risk Checks
function testRiskLimits() {
  const { checkRiskLimits } = require('../risk/risk-limits');
  
  // Within limits
  const within = checkRiskLimits({ balance: 10000, dailyPnL: -100, openPositions: 3 });
  assert(within.approved === true, 'Within limits should approve');
  
  // Daily loss exceeded
  const lossExceeded = checkRiskLimits({ balance: 10000, dailyPnL: -600, openPositions: 3 });
  assert(lossExceeded.approved === false, 'Loss exceeded should reject');
  
  console.log('✅ Risk limits: PASS');
}

// Test 4: Fee Calculation
function testFeeCalculation() {
  const { calculateFee } = require('../fee/fee-calculator');
  
  const fee = calculateFee(1000, 'maker');
  assert(fee > 0, 'Fee should be positive');
  assert(fee <= 2, 'Maker fee should be <= 0.2%');
  
  console.log('✅ Fee calculation: PASS');
}

// Test 5: Stop Loss Calculation
function testStopLoss() {
  const { calculateStopLoss } = require('../risk/stop-loss');
  
  const stop = calculateStopLoss(50000, 'long', 0.02);
  assert(stop < 50000, 'Long stop should be below entry');
  assert(stop > 50000 * 0.97, 'Stop should not be more than 2% away');
  
  console.log('✅ Stop loss: PASS');
}

// Run all tests
console.log('\n🧪 Running Unit Tests...\n');

try {
  testPositionSizing();
  testDataValidator();
  testRiskLimits();
  testFeeCalculation();
  testStopLoss();
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
}
