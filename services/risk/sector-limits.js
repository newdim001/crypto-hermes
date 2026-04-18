// CryptoEdge Sector Exposure Limits
// Limit exposure by category

class SectorLimits {
  constructor() {
    this.sectors = {
      'L1': { symbols: ['BTC', 'ETH', 'SOL', 'AVAX', 'ADA', 'DOT'], maxExposure: 40 },
      'L2': { symbols: ['MATIC', 'ARB', 'OP'], maxExposure: 20 },
      'DEFI': { symbols: ['UNI', 'AAVE', 'LINK', 'MKR'], maxExposure: 20 },
      'MEME': { symbols: ['DOGE', 'SHIB', 'PEPE'], maxExposure: 10 },
      'EXCHANGE': { symbols: ['BNB', 'CRO', 'FTT'], maxExposure: 15 },
      'OTHER': { symbols: [], maxExposure: 15 }
    };
    
    this.positions = new Map();
  }

  // Get sector for symbol
  getSector(symbol) {
    const clean = symbol.replace('USDT', '');
    for (const [sector, data] of Object.entries(this.sectors)) {
      if (data.symbols.includes(clean)) return sector;
    }
    return 'OTHER';
  }

  // Update position
  updatePosition(symbol, value) {
    this.positions.set(symbol, value);
    return this.checkLimits();
  }

  // Check all limits
  checkLimits() {
    const totalValue = Array.from(this.positions.values()).reduce((a, b) => a + b, 0);
    if (totalValue === 0) return { violations: [], exposure: {} };
    
    // Calculate sector exposure
    const sectorExposure = {};
    for (const sector of Object.keys(this.sectors)) {
      sectorExposure[sector] = 0;
    }
    
    for (const [symbol, value] of this.positions) {
      const sector = this.getSector(symbol);
      sectorExposure[sector] += (value / totalValue) * 100;
    }
    
    // Check violations
    const violations = [];
    for (const [sector, exposure] of Object.entries(sectorExposure)) {
      const limit = this.sectors[sector].maxExposure;
      if (exposure > limit) {
        violations.push({
          sector,
          exposure: exposure.toFixed(1) + '%',
          limit: limit + '%',
          overBy: (exposure - limit).toFixed(1) + '%'
        });
      }
    }
    
    return {
      violations,
      exposure: Object.fromEntries(
        Object.entries(sectorExposure).map(([k, v]) => [k, v.toFixed(1) + '%'])
      ),
      withinLimits: violations.length === 0
    };
  }

  // Check if new position allowed
  canAddPosition(symbol, value) {
    const tempPositions = new Map(this.positions);
    const current = tempPositions.get(symbol) || 0;
    tempPositions.set(symbol, current + value);
    
    // Temporarily update and check
    const origPositions = this.positions;
    this.positions = tempPositions;
    const result = this.checkLimits();
    this.positions = origPositions;
    
    return {
      allowed: result.violations.length === 0,
      wouldViolate: result.violations
    };
  }

  // Get exposure summary
  getSummary() {
    return this.checkLimits();
  }
}

module.exports = new SectorLimits();
