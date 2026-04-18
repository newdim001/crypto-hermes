/**
 * Risk Limits - Daily loss and position limits
 */
const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, '../../data/state.json');

class RiskLimits {
  constructor(config = {}) {
    this.maxDailyLoss = config.maxDailyLoss || 0.03;   // 3%
    this.maxPositions = config.maxPositions || 5;
    this.maxDrawdown = config.maxDrawdown || 0.15;      // 15%
    this.initialBalance = config.initialBalance || 10000;
  }

  getState() {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (_) { return { balance: this.initialBalance, dailyPnl: 0 }; }
  }

  checkDailyLoss(currentBalance) {
    const state = this.getState();
    const startBalance = state.dayStartBalance || this.initialBalance;
    const dailyLossPct = (startBalance - currentBalance) / startBalance;
    const shouldHalt = dailyLossPct >= this.maxDailyLoss;
    return {
      shouldHalt,
      dailyLossPct: (dailyLossPct * 100).toFixed(2) + '%',
      limit: (this.maxDailyLoss * 100).toFixed(0) + '%'
    };
  }

  checkDrawdown(currentBalance) {
    const drawdownPct = (this.initialBalance - currentBalance) / this.initialBalance;
    const shouldHalt = drawdownPct >= this.maxDrawdown;
    return {
      shouldHalt,
      drawdownPct: (drawdownPct * 100).toFixed(2) + '%',
      limit: (this.maxDrawdown * 100).toFixed(0) + '%'
    };
  }

  checkAll(currentBalance) {
    return {
      dailyLoss: this.checkDailyLoss(currentBalance),
      drawdown: this.checkDrawdown(currentBalance),
      shouldHalt: this.checkDailyLoss(currentBalance).shouldHalt || this.checkDrawdown(currentBalance).shouldHalt
    };
  }
}

module.exports = RiskLimits;

// Named export for kill-switch-test compatibility
function checkRiskLimits({ balance, dailyPnL, openPositions }) {
  const limits = new RiskLimits({ initialBalance: balance });
  const startBalance = balance - dailyPnL; // approximate
  const dailyLossPct = Math.abs(dailyPnL) / startBalance;
  const approved = dailyLossPct < limits.maxDailyLoss && openPositions <= limits.maxPositions;
  return { approved, dailyLossPct, openPositions, shouldHalt: !approved };
}
module.exports.checkRiskLimits = checkRiskLimits;
