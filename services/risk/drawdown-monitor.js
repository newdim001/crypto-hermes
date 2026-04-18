/**
 * Drawdown Monitor
 */
const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, '../../data/state.json');

class DrawdownMonitor {
  constructor(config = {}) {
    this.maxDrawdown = config.maxDrawdown || 0.15;
    this.peakBalance = config.initialBalance || 10000;
  }

  updatePeak(balance) {
    if (balance > this.peakBalance) this.peakBalance = balance;
  }

  getCurrentDrawdown(balance) {
    this.updatePeak(balance);
    return (this.peakBalance - balance) / this.peakBalance;
  }

  shouldHalt(balance) {
    const dd = this.getCurrentDrawdown(balance);
    return {
      shouldHalt: dd >= this.maxDrawdown,
      currentDrawdown: (dd * 100).toFixed(2) + '%',
      maxAllowed: (this.maxDrawdown * 100).toFixed(0) + '%',
      peakBalance: this.peakBalance
    };
  }

  getMetrics(balance) {
    const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); } catch(_){return{};} })();
    const peak = Math.max(balance, state.peakBalance || balance);
    const dd = (peak - balance) / peak;
    return {
      currentBalance: balance,
      peakBalance: peak,
      drawdown: dd,
      drawdownPct: (dd * 100).toFixed(2) + '%',
      shouldHalt: dd >= this.maxDrawdown
    };
  }
}

module.exports = DrawdownMonitor;

// Named export for kill-switch-test compatibility
function checkDrawdownLimit({ peakBalance, currentBalance }) {
  const monitor = new DrawdownMonitor({ maxDrawdown: 0.15, initialBalance: peakBalance });
  monitor.peakBalance = peakBalance;
  return monitor.shouldHalt(currentBalance);
}
module.exports.checkDrawdownLimit = checkDrawdownLimit;
