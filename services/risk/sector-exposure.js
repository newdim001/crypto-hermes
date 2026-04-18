/**
 * Sector Exposure Limits Service
 * Enforces maximum exposure per sector and per pair
 */

const fs = require('fs');
const path = require('path');

class SectorExposureManager {
  constructor(config = {}) {
    this.limits = config.limits || {
      sectors: {
        defi: 0.30,        // Max 30% in DeFi
        layer1: 0.30,     // Max 30% in L1s
        meme: 0.20,       // Max 20% in Memes
        stable: 0.50,     // Max 50% in Stablecoins
        layer2: 0.20,     // Max 20% in L2s
        exchange: 0.25,   // Max 25% in Exchange tokens
      },
      pairs: {
        maxSingle: 0.15,  // Max 15% in any single pair
        maxCorrelation: 0.60, // Max 60% correlated positions
      },
      global: {
        maxTotal: 1.0,    // Max 100% of portfolio
        maxShort: 0.50,   // Max 50% in shorts
        maxLong: 0.70,    // Max 70% in longs
      },
    };
    
    this.positions = [];
    this.positionFile = config.positionFile || path.join(__dirname, '../../data/positions.json');
    this.loadPositions();
    
    // Sector mapping
    this.sectorMap = {
      'BTC': 'store-of-value',
      'ETH': 'layer1',
      'BNB': 'exchange',
      'SOL': 'layer1',
      'XRP': 'payment',
      'ADA': 'layer1',
      'DOGE': 'meme',
      'AVAX': 'layer1',
      'DOT': 'layer1',
      'MATIC': 'layer2',
      'ARB': 'layer2',
      'OP': 'layer2',
      'LINK': 'defi',
      'UNI': 'defi',
      'AAVE': 'defi',
      'MKR': 'defi',
      'SNX': 'defi',
      'CRV': 'defi',
    };
  }

  loadPositions() {
    try {
      if (fs.existsSync(this.positionFile)) {
        this.positions = JSON.parse(fs.readFileSync(this.positionFile, 'utf8'));
      }
    } catch (err) {
      this.positions = [];
    }
  }

  savePositions() {
    const dir = path.dirname(this.positionFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.positionFile, JSON.stringify(this.positions, null, 2));
  }

  // Get sector for a symbol
  getSector(symbol) {
    const upper = symbol.toUpperCase().replace('USDT', '');
    return this.sectorMap[upper] || 'other';
  }

  // Calculate current exposure
  calculateExposure() {
    const exposure = {
      sectors: {},
      pairs: {},
      directions: { long: 0, short: 0 },
      total: 0,
    };
    
    this.positions.forEach(pos => {
      const size = pos.size || 0;
      const value = pos.notionalValue || (pos.size * pos.entryPrice);
      const direction = pos.direction || 'long';
      
      // Sector exposure
      const sector = this.getSector(pos.symbol);
      exposure.sectors[sector] = (exposure.sectors[sector] || 0) + value;
      
      // Single pair exposure
      exposure.pairs[pos.symbol] = (exposure.pairs[pos.symbol] || 0) + value;
      
      // Direction exposure
      exposure.directions[direction] += value;
      
      exposure.total += value;
    });
    
    // Convert to percentages
    const total = exposure.total || 1;
    Object.keys(exposure.sectors).forEach(s => {
      exposure.sectors[s] = exposure.sectors[s] / total;
    });
    Object.keys(exposure.pairs).forEach(p => {
      exposure.pairs[p] = exposure.pairs[p] / total;
    });
    exposure.directions.long /= total;
    exposure.directions.short /= total;
    
    return exposure;
  }

  // Check if new position is allowed
  canOpenPosition(symbol, size, direction = 'long') {
    const exposure = this.calculateExposure();
    const sector = this.getSector(symbol);
    const newValue = size; // Simplified
    const totalValue = exposure.total + newValue;
    
    const checks = {
      sector: {
        limit: this.limits.sectors[sector] || 0.20,
        current: exposure.sectors[sector] || 0,
        proposed: newValue / totalValue,
        allowed: true,
      },
      singlePair: {
        limit: this.limits.pairs.maxSingle,
        current: exposure.pairs[symbol] || 0,
        proposed: newValue / totalValue,
        allowed: true,
      },
      direction: {
        limit: direction === 'long' ? this.limits.global.maxLong : this.limits.global.maxShort,
        current: direction === 'long' ? exposure.directions.long : exposure.directions.short,
        proposed: (exposure.directions[direction] * exposure.total + newValue) / totalValue,
        allowed: true,
      },
      total: {
        limit: this.limits.global.maxTotal,
        current: exposure.total,
        allowed: true,
      },
    };
    
    // Check sector limit
    if (checks.sector.proposed > checks.sector.limit) {
      checks.sector.allowed = false;
      checks.sector.message = `Sector ${sector} would exceed ${checks.sector.limit * 100}% limit`;
    }
    
    // Check single pair limit
    if (checks.singlePair.proposed > checks.singlePair.limit) {
      checks.singlePair.allowed = false;
      checks.singlePair.message = `Pair ${symbol} would exceed ${checks.singlePair.limit * 100}% limit`;
    }
    
    // Check direction limit
    if (checks.direction.proposed > checks.direction.limit) {
      checks.direction.allowed = false;
      checks.direction.message = `Direction ${direction} would exceed ${checks.direction.limit * 100}% limit`;
    }
    
    // Check total limit
    if (totalValue > this.limits.global.maxTotal) {
      checks.total.allowed = false;
      checks.total.message = 'Total exposure would exceed 100%';
    }
    
    const allAllowed = Object.values(checks).every(c => c.allowed);
    
    return {
      allowed: allAllowed,
      checks,
      reduceAmount: allAllowed ? 0 : this.calculateReduceAmount(checks, totalValue),
    };
  }

  // Calculate how much to reduce to fit limits
  calculateReduceAmount(checks, totalValue) {
    let reduce = 0;
    
    if (!checks.sector.allowed) {
      const sectorLimit = totalValue * checks.sector.limit;
      const currentSector = totalValue * checks.sector.current;
      reduce = Math.max(reduce, currentSector - sectorLimit);
    }
    
    if (!checks.singlePair.allowed) {
      const pairLimit = totalValue * checks.singlePair.limit;
      const currentPair = totalValue * checks.singlePair.current;
      reduce = Math.max(reduce, currentPair - pairLimit);
    }
    
    return reduce;
  }

  // Auto-reduce positions to meet limits
  autoReduceToLimits() {
    const exposure = this.calculateExposure();
    const toReduce = [];
    
    // Check sectors
    Object.keys(this.limits.sectors).forEach(sector => {
      const limit = this.limits.sectors[sector];
      const current = exposure.sectors[sector] || 0;
      
      if (current > limit) {
        const excess = current - limit;
        // Find positions in this sector to reduce
        const sectorPositions = this.positions.filter(p => this.getSector(p.symbol) === sector);
        
        toReduce.push({
          reason: `Sector ${sector} exceeds ${limit * 100}%`,
          amount: excess * exposure.total,
          positions: sectorPositions.map(p => p.symbol),
        });
      }
    });
    
    // Check single pairs
    Object.keys(exposure.pairs).forEach(pair => {
      const limit = this.limits.pairs.maxSingle;
      const current = exposure.pairs[pair];
      
      if (current > limit) {
        const excess = current - limit;
        toReduce.push({
          reason: `Pair ${pair} exceeds ${limit * 100}%`,
          amount: excess * exposure.total,
          positions: [pair],
        });
      }
    });
    
    return toReduce;
  }

  // Add position
  addPosition(symbol, size, entryPrice, direction = 'long') {
    const canTrade = this.canOpenPosition(symbol, size * entryPrice, direction);
    
    if (!canTrade.allowed) {
      console.log(`❌ Position rejected: ${JSON.stringify(canTrade.checks, null, 2)}`);
      return { success: false, reason: canTrade.checks };
    }
    
    this.positions.push({
      symbol,
      size,
      entryPrice,
      direction,
      notionalValue: size * entryPrice,
      timestamp: new Date().toISOString(),
    });
    
    this.savePositions();
    console.log(`✅ Position added: ${symbol} ${direction} ${size}`);
    
    return { success: true };
  }

  // Remove position
  removePosition(symbol) {
    const idx = this.positions.findIndex(p => p.symbol === symbol);
    if (idx >= 0) {
      this.positions.splice(idx, 1);
      this.savePositions();
      console.log(`✅ Position removed: ${symbol}`);
      return true;
    }
    return false;
  }

  // Get status report
  getStatus() {
    const exposure = this.calculateExposure();
    const violations = [];
    
    // Check for violations
    Object.keys(this.limits.sectors).forEach(sector => {
      const limit = this.limits.sectors[sector];
      const current = exposure.sectors[sector] || 0;
      if (current > limit) {
        violations.push(`Sector ${sector}: ${(current * 100).toFixed(1)}% / ${(limit * 100).toFixed(0)}% limit`);
      }
    });
    
    Object.keys(exposure.pairs).forEach(pair => {
      const limit = this.limits.pairs.maxSingle;
      const current = exposure.pairs[pair];
      if (current > limit) {
        violations.push(`Pair ${pair}: ${(current * 100).toFixed(1)}% / ${(limit * 100).toFixed(0)}% limit`);
      }
    });
    
    return {
      exposure,
      violations,
      limits: this.limits,
      positionCount: this.positions.length,
    };
  }

  // Update limits
  updateLimits(newLimits) {
    this.limits = { ...this.limits, ...newLimits };
    console.log('✅ Limits updated');
  }
}

// CLI
if (require.main === module) {
  const manager = new SectorExposureManager();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'status':
      console.log('\n📊 Sector Exposure Status:\n', JSON.stringify(manager.getStatus(), null, 2));
      break;
    case 'can-open':
      if (args[1] && args[2]) {
        const result = manager.canOpenPosition(args[1], parseFloat(args[2]), args[3] || 'long');
        console.log('\n✅ Allowed' if result.allowed else '\n❌ Not Allowed');
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('Usage: node sector-limits.js can-open <symbol> <value> [direction]');
      }
      break;
    case 'auto-reduce':
      console.log('\n🔄 Auto-reduce recommendations:\n', JSON.stringify(manager.autoReduceToLimits(), null, 2));
      break;
    case 'add':
      if (args[1] && args[2] && args[3]) {
        manager.addPosition(args[1], parseFloat(args[2]), parseFloat(args[3]), args[4]);
      } else {
        console.log('Usage: node sector-limits.js add <symbol> <size> <price> [direction]');
      }
      break;
    default:
      console.log('Usage: node sector-limits.js [status|can-open|auto-reduce|add]');
  }
}

module.exports = { SectorExposureManager };
