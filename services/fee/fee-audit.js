// CryptoEdge Fee Audit
class FeeAudit {
  constructor() {
    this.dailyFees = [];
    this.tradeFees = [];
  }
  
  // Log a trade fee
  logTrade(trade) {
    this.tradeFees.push({ ...trade, timestamp: Date.now() });
    if (this.tradeFees.length > 1000) this.tradeFees.shift();
  }
  
  // Daily summary
  getDailySummary(date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const todayFees = this.tradeFees.filter(t => t.timestamp >= startOfDay.getTime());
    
    const total = todayFees.reduce((sum, t) => sum + (t.fee || 0), 0);
    const count = todayFees.length;
    const avg = count > 0 ? total / count : 0;
    
    return {
      date: date.toISOString().split('T')[0],
      totalFees: total.toFixed(2),
      tradeCount: count,
      avgFee: avg.toFixed(2),
      byType: this.groupByType(todayFees)
    };
  }
  
  groupByType(fees) {
    const types = {};
    for (const f of fees) {
      types[f.type] = (types[f.type] || 0) + (f.fee || 0);
    }
    return types;
  }
  
  // Weekly optimization
  getWeeklyOptimization() {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekFees = this.tradeFees.filter(t => t.timestamp >= weekAgo);
    
    const total = weekFees.reduce((sum, t) => sum + (t.fee || 0), 0);
    const volume = weekFees.reduce((sum, t) => sum + (t.volume || 0), 0);
    
    const effectiveRate = volume > 0 ? (total / volume) * 100 : 0;
    
    return {
      totalFees: total.toFixed(2),
      volume: volume.toFixed(2),
      effectiveRate: effectiveRate.toFixed(3) + '%',
      recommendation: effectiveRate > 0.2 ? 'Optimize: fees too high' : 'Good: fees under control'
    };
  }
}

module.exports = new FeeAudit();
