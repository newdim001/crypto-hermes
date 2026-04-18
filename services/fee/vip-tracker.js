// CryptoEdge VIP Tracker - FIXED
class VIPTracker {
  constructor() {
    this.levels = {
      0: { volume: 0, maker: 0.001, taker: 0.001, futuresMaker: 0.0002, futuresTaker: 0.0004 },
      1: { volume: 1000000, maker: 0.0009, taker: 0.001, futuresMaker: 0.00016, futuresTaker: 0.0004 },
      3: { volume: 4000000, maker: 0.0007, taker: 0.0008, futuresMaker: 0.00014, futuresTaker: 0.00032 },
      5: { volume: 20000000, maker: 0.00042, taker: 0.00055, futuresMaker: 0.0001, futuresTaker: 0.0002 },
      9: { volume: 1000000000, maker: 0.00016, taker: 0.00024, futuresMaker: 0.00006, futuresTaker: 0.00008 }
    };
    this.levelList = [0, 1, 3, 5, 9];
  }
  
  getCurrentLevel(volumeUSDT, bnbHoldings) {
    let level = 0;
    
    // Volume-based
    for (const l of this.levelList) {
      if (volumeUSDT >= this.levels[l].volume) {
        level = Math.max(level, l);
      }
    }
    
    // BNB-based
    if (bnbHoldings >= 100) level = Math.max(level, 5);
    else if (bnbHoldings >= 50) level = Math.max(level, 3);
    else if (bnbHoldings >= 25) level = Math.max(level, 1);
    
    return level;
  }
  
  getRates(level) {
    return this.levels[level] || this.levels[0];
  }
  
  getSavings(level) {
    const base = this.levels[0];
    const current = this.levels[level] || this.levels[0];
    return {
      spot: ((base.taker - current.taker) / base.taker * 100).toFixed(0) + '%',
      futures: ((base.futuresTaker - current.futuresTaker) / base.futuresTaker * 100).toFixed(0) + '%'
    };
  }
  
  shouldHoldBNB(volumeUSDT, bnbPrice, currentBnb) {
    const withBnb = this.getCurrentLevel(volumeUSDT, currentBnb);
    const withoutBnb = this.getCurrentLevel(volumeUSDT, 0);
    
    return {
      currentLevel: withBnb,
      levelWithoutBNB: withoutBnb,
      benefit: withBnb > withoutBnb,
      recommendation: withBnb > withoutBnb ? 'HOLD BNB' : 'No BNB needed'
    };
  }
}

module.exports = new VIPTracker();
