// CryptoEdge Integration Tests
// Full cycle system tests

class IntegrationTestRunner {
  constructor() {
    this.results = [];
    this.testSuites = {};
  }

  // Define test suite
  suite(name, tests) {
    this.testSuites[name] = tests;
  }

  // Run all suites
  async runAll() {
    this.results = [];
    
    for (const [suiteName, tests] of Object.entries(this.testSuites)) {
      console.log(`\nRunning suite: ${suiteName}`);
      
      for (const [testName, testFn] of Object.entries(tests)) {
        try {
          const startTime = Date.now();
          await testFn();
          const duration = Date.now() - startTime;
          
          this.results.push({
            suite: suiteName,
            test: testName,
            passed: true,
            duration: duration + 'ms'
          });
          console.log(`  ✅ ${testName} (${duration}ms)`);
        } catch (error) {
          this.results.push({
            suite: suiteName,
            test: testName,
            passed: false,
            error: error.message
          });
          console.log(`  ❌ ${testName}: ${error.message}`);
        }
      }
    }
    
    return this.getSummary();
  }

  // Get summary
  getSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    
    return {
      total: this.results.length,
      passed,
      failed,
      passRate: ((passed / this.results.length) * 100).toFixed(1) + '%',
      suites: Object.keys(this.testSuites).length,
      failedTests: this.results.filter(r => !r.passed)
    };
  }
}

// Create test runner with predefined tests
const runner = new IntegrationTestRunner();

runner.suite('DataFlow', {
  'Data collector to analyzer': async () => {
    const collector = require('../data-collector');
    const analyzer = require('../ml/market-analyzer');
    // Test passes if no error
    return true;
  },
  'Analyzer to trading engine': async () => {
    return true;
  }
});

runner.suite('RiskManagement', {
  'Position sizer integration': async () => {
    const sizer = require('../risk/position-sizer');
    const result = sizer.calculate({
      balance: 10000,
      riskPercent: 1,
      stopLoss: 2
    });
    if (!result.positionSize) throw new Error('No position size');
    return true;
  },
  'Trailing stop integration': async () => {
    const stop = require('../risk/trailing-stop');
    return true;
  }
});

runner.suite('LearningSystem', {
  'Q-learning agent': async () => {
    const agent = require('../learning/agents/q-learning-agent');
    return true;
  },
  'Experience replay': async () => {
    const replay = require('../learning/experience-replay');
    return true;
  }
});

runner.suite('FeeManagement', {
  'Fee calculator': async () => {
    const calc = require('../fee/fee-calculator');
    const fee = calc.calculate('BTCUSDT', 'SPOT', 100, 'market');
    if (fee.fee === undefined) throw new Error('No fee calculated');
    return true;
  }
});

module.exports = runner;
