// CryptoEdge Reward Function
// Comprehensive reward calculation with penalties

class RewardFunction {
  constructor(config = {}) {
    this.config = {
      profitWeight: config.profitWeight || 1.0,
      riskPenalty: config.riskPenalty || 0.5,
      drawdownPenalty: config.drawdownPenalty || 1.0,
      timePenalty: config.timePenalty || 0.1,
      winBonus: config.winBonus || 0.5,
      sharpeBonus: config.sharpeBonus || 1.0
    };
    
    this.tradeHistory = [];
  }
  
  calculate(experience) {
    const { pnl, balance, initialBalance, position, steps, maxSteps, win } = experience;
    
    let reward = 0;
    
    // 1. Profit/Loss reward (normalized)
    reward += pnl * this.config.profitWeight / initialBalance * 100;
    
    // 2. Risk penalty for high drawdown
    const drawdown = (initialBalance - balance) / initialBalance;
    if (drawdown > 0.1) reward -= this.config.drawdownPenalty * (drawdown - 0.1) * 10;
    if (drawdown > 0.2) reward -= this.config.drawdownPenalty * 5;
    
    // 3. Time penalty for holding too long
    if (position && steps > maxSteps * 0.8) {
      reward -= this.config.timePenalty;
    }
    
    // 4. Win bonus
    if (win && pnl > 0) reward += this.config.winBonus;
    
    // 5. Risk-adjusted return (simplified Sharpe)
    if (this.tradeHistory.length > 10) {
      const returns = this.tradeHistory.map(t => t.pnl / initialBalance);
      const mean = returns.reduce((a,b) => a+b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length);
      if (std > 0) {
        const sharpe = mean / std * Math.sqrt(252);
        if (sharpe > 1.5) reward += this.config.sharpeBonus;
      }
    }
    
    return reward;
  }
  
  // Multi-objective reward
  multiObjective(experience) {
    const { pnl, balance, initialBalance, maxDrawdown, tradeDuration, win } = experience;
    
    return {
      profit: pnl / initialBalance * 100,
      risk: -Math.abs(maxDrawdown) * 10,
      efficiency: tradeDuration > 0 ? (pnl / tradeDuration) : 0,
      win: win ? 10 : -5,
      total: this.calculate(experience)
    };
  }
  
  recordTrade(trade) {
    this.tradeHistory.push(trade);
    // Keep last 100 trades
    if (this.tradeHistory.length > 100) {
      this.tradeHistory.shift();
    }
  }
  
  getStats() {
    if (this.tradeHistory.length === 0) return { trades: 0 };
    
    const wins = this.tradeHistory.filter(t => t.pnl > 0).length;
    const totalPnL = this.tradeHistory.reduce((s, t) => s + t.pnl, 0);
    
    return {
      trades: this.tradeHistory.length,
      wins,
      losses: this.tradeHistory.length - wins,
      winRate: (wins / this.tradeHistory.length * 100).toFixed(1) + '%',
      totalPnL: totalPnL.toFixed(2)
    };
  }
}

module.exports = new RewardFunction();
