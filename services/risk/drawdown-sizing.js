// CryptoEdge Drawdown-Based Position Sizing
// Reduce size when in drawdown

class DrawdownSizing {
  constructor() {
    this.peakBalance = 0;
    this.currentBalance = 0;
    this.drawdownLevels = [
      { threshold: 5, multiplier: 0.8 },   // 5% DD = 80% size
      { threshold: 10, multiplier: 0.5 },  // 10% DD = 50% size
      { threshold: 15, multiplier: 0.25 }, // 15% DD = 25% size
      { threshold: 20, multiplier: 0 }     // 20% DD = STOP
    ];
  }

  // Update balance
  updateBalance(balance) {
    this.currentBalance = balance;
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
    return this.calculate();
  }

  // Calculate current drawdown and size multiplier
  calculate() {
    if (this.peakBalance === 0) {
      return { drawdown: 0, multiplier: 1 };
    }
    
    const drawdown = ((this.peakBalance - this.currentBalance) / this.peakBalance) * 100;
    
    // Find appropriate multiplier
    let multiplier = 1;
    for (const level of this.drawdownLevels) {
      if (drawdown >= level.threshold) {
        multiplier = level.multiplier;
      }
    }
    
    return {
      peakBalance: this.peakBalance.toFixed(2),
      currentBalance: this.currentBalance.toFixed(2),
      drawdown: drawdown.toFixed(2) + '%',
      multiplier,
      adjustedSize: (multiplier * 100).toFixed(0) + '%',
      status: this.getStatus(drawdown)
    };
  }

  // Get status label
  getStatus(drawdown) {
    if (drawdown >= 20) return 'STOPPED';
    if (drawdown >= 15) return 'CRITICAL';
    if (drawdown >= 10) return 'WARNING';
    if (drawdown >= 5) return 'CAUTION';
    return 'NORMAL';
  }

  // Apply to position size
  applyToSize(baseSize) {
    const { multiplier } = this.calculate();
    return {
      baseSize,
      adjustedSize: baseSize * multiplier,
      multiplier
    };
  }

  // Reset peak (after recovery)
  resetPeak() {
    this.peakBalance = this.currentBalance;
    return { reset: true, newPeak: this.peakBalance };
  }
}

module.exports = new DrawdownSizing();
