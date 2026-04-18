// CryptoEdge Unit Test Framework

class UnitTestRunner {
  constructor() {
    this.results = [];
  }
  
  // Test function
  test(name, fn) {
    try {
      const result = fn();
      if (result === true || result === undefined) {
        this.results.push({ name, passed: true });
        return true;
      } else {
        this.results.push({ name, passed: false, error: 'Assertion failed' });
        return false;
      }
    } catch (e) {
      this.results.push({ name, passed: false, error: e.message });
      return false;
    }
  }
  
  // Run all tests
  run(tests) {
    this.results = [];
    console.log('Running tests...');
    
    for (const [name, fn] of Object.entries(tests)) {
      this.test(name, fn);
    }
    
    return this.summary();
  }
  
  // Summary
  summary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    return {
      total: this.results.length,
      passed,
      failed,
      success: failed === 0
    };
  }
}

// Test examples
const runner = new UnitTestRunner();
const results = runner.run({
  'DataValidator - valid data': () => {
    const v = require('./data-validator.js');
    const r = v.validate({ price: 50000, volume: 100, timestamp: Date.now() });
    return r.valid === true;
  },
  'ModelDrift - detection': () => {
    const m = require('./model-drift.js');
    m.recordPrediction('BTC', 'BUY', 'BUY');
    return m.performanceHistory.length === 1;
  },
  'StressTest - scenario': () => {
    const s = require('./stress-tester.js');
    const r = s.runScenario('BLACK_MONDAY', { balance: 10000, position: 0 });
    return r.survived !== undefined;
  },
  'Liquidation - calculation': () => {
    const l = require('./liquidation-map.js');
    const r = l.calculate(50000, 10, 'LONG');
    return parseFloat(r.liquidationPrice) < 50000;
  }
});

console.log('Test Results:', results);
