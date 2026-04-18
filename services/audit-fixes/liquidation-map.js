// CryptoEdge Liquidation Level Mapper

class LiquidationMapper {
  constructor() {
    this.levels = new Map();
  }
  
  // Calculate liquidation levels
  calculate(entryPrice, leverage, side) {
    const liquidationPercent = 100 / leverage;
    
    let liquidationPrice;
    if (side === 'LONG') {
      liquidationPrice = entryPrice * (1 - liquidationPercent / 100);
    } else {
      liquidationPrice = entryPrice * (1 + liquidationPercent / 100);
    }
    
    const distancePercent = liquidationPercent;
    
    return {
      entryPrice,
      liquidationPrice: liquidationPrice.toFixed(2),
      distancePercent: distancePercent.toFixed(2) + '%',
      leverage: leverage + 'x',
      risk: leverage > 10 ? 'EXTREME' : leverage > 5 ? 'HIGH' : 'MODERATE'
    };
  }
  
  // Get safe stop distance
  getSafeStop(entryPrice, liquidationPrice, safetyMargin = 1.5) {
    const liqDistance = Math.abs(entryPrice - liquidationPrice);
    const safeDistance = liqDistance * safetyMargin;
    
    return {
      minimumStop: safeDistance.toFixed(2),
      safetyMargin: safetyMargin + 'x'
    };
  }
  
  // Map cluster levels (where many liquidations happen)
  getClusterLevels(prices, clusterThreshold = 5) {
    const clusters = [];
    const sorted = [...prices].sort((a, b) => a - b);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] < sorted[i] * 0.01) {
        clusters.push({ level: sorted[i], count: 2 });
      }
    }
    
    return clusters.filter(c => c.count >= clusterThreshold);
  }
}

module.exports = new LiquidationMapper();
