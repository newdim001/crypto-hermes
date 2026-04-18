/**
 * Support & Resistance Detector v2
 * Identifies key price levels for better entry/exit points
 */

const CONFIG = {
  lookbackPeriod: 100, // candles to analyze
  minTouches: 2, // minimum touches to confirm a level
  tolerancePercent: 0.5, // tolerance for "touching" a level
  srStrengthThreshold: 0.6 // S/R strength threshold
};

/**
 * Find all support and resistance levels
 */
function findSupportResistance(candles) {
  if (!candles || candles.length < CONFIG.lookbackPeriod) {
    return { supports: [], resistances: [], zones: [] };
  }
  
  const recentCandles = candles.slice(-CONFIG.lookbackPeriod);
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const closes = recentCandles.map(c => c.close);
  
  // Find swing highs and lows
  const swingHighs = findSwingPoints(highs, 'high');
  const swingLows = findSwingPoints(lows, 'low');
  
  // Cluster the levels
  const resistanceLevels = clusterLevels(swingHighs);
  const supportLevels = clusterLevels(swingLows);
  
  // Calculate strength for each level
  const resistances = resistanceLevels.map(level => ({
    price: level.price,
    touches: level.touches,
    strength: calculateStrength(level, highs, 'resistance'),
    type: 'resistance'
  })).filter(r => r.touches >= CONFIG.minTouches)
    .sort((a, b) => b.strength - a.strength);
  
  const supports = supportLevels.map(level => ({
    price: level.price,
    touches: level.touches,
    strength: calculateStrength(level, lows, 'support'),
    type: 'support'
  })).filter(s => s.touches >= CONFIG.minTouches)
    .sort((a, b) => b.strength - a.strength);
  
  // Find S/R zones (wider areas)
  const zones = findSRZones(supports, resistances, closes);
  
  return { supports, resistances, zones };
}

/**
 * Find swing points
 */
function findSwingPoints(values, type) {
  const points = [];
  const threshold = 0.001; // 0.1% minimum move
  
  for (let i = 2; i < values.length - 2; i++) {
    const prev = values[i - 2];
    const curr = values[i];
    const next = values[i + 2];
    
    if (type === 'high') {
      if (curr > prev && curr > next && (curr - prev) / prev > threshold) {
        points.push({ index: i, price: curr });
      }
    } else {
      if (curr < prev && curr < next && (prev - curr) / curr > threshold) {
        points.push({ index: i, price: curr });
      }
    }
  }
  
  return points;
}

/**
 * Cluster nearby levels
 */
function clusterLevels(points) {
  if (points.length === 0) return [];
  
  const clusters = [];
  const sorted = [...points].sort((a, b) => a.price - b.price);
  
  let currentCluster = {
    prices: [sorted[0].price],
    indices: [sorted[0].index]
  };
  
  for (let i = 1; i < sorted.length; i++) {
    const price = sorted[i].price;
    const prevPrice = currentCluster.prices[currentCluster.prices.length - 1];
    const avgPrice = currentCluster.prices.reduce((a, b) => a + b, 0) / currentCluster.prices.length;
    
    // If within 1% of cluster average, add to cluster
    if (Math.abs(price - avgPrice) / avgPrice < 0.01) {
      currentCluster.prices.push(price);
      currentCluster.indices.push(sorted[i].index);
    } else {
      // Start new cluster
      clusters.push({
        price: currentCluster.prices.reduce((a, b) => a + b, 0) / currentCluster.prices.length,
        touches: currentCluster.prices.length
      });
      currentCluster = { prices: [price], indices: [sorted[i].index] };
    }
  }
  
  // Add last cluster
  clusters.push({
    price: currentCluster.prices.reduce((a, b) => a + b, 0) / currentCluster.prices.length,
    touches: currentCluster.prices.length
  });
  
  return clusters;
}

/**
 * Calculate strength of a level
 */
function calculateStrength(level, prices, type) {
  let strength = 0;
  const tolerance = level.price * (CONFIG.tolerancePercent / 100);
  
  // Count how many times price touched this level
  let touches = 0;
  let bounces = 0;
  
  for (const price of prices) {
    if (Math.abs(price - level.price) <= tolerance) {
      touches++;
      // Check for bounce
      bounces++;
    }
  }
  
  // Strength factors:
  // 1. Number of touches (more = stronger)
  strength += Math.min(touches / 10, 1) * 30;
  
  // 2. Recent touches weighted more
  const recentTouches = level.touches || 1;
  strength += Math.min(recentTouches / 5, 1) * 20;
  
  // 3. How clean the bounces are
  const bounceRate = bounces / prices.length;
  strength += bounceRate * 20;
  
  // 4. Volume confirmation (would need volume data)
  // Simplified: assume moderate volume confirmation
  strength += 15;
  
  // 5. Age of level (recent = stronger)
  strength += 15;
  
  return Math.min(100, strength);
}

/**
 * Find S/R zones (wider areas instead of exact levels)
 */
function findSRZones(supports, resistances, closes) {
  const zones = [];
  
  // Create resistance zones
  for (const r of resistances.slice(0, 5)) {
    zones.push({
      type: 'resistance',
      high: r.price * 1.002,
      low: r.price * 0.998,
      mid: r.price,
      strength: r.strength
    });
  }
  
  // Create support zones
  for (const s of supports.slice(0, 5)) {
    zones.push({
      type: 'support',
      high: s.price * 1.002,
      low: s.price * 0.998,
      mid: s.price,
      strength: s.strength
    });
  }
  
  return zones.sort((a, b) => b.strength - a.strength);
}

/**
 * Check if price is near a support/resistance level
 */
function checkNearLevel(price, supports, resistances) {
  const tolerance = price * (CONFIG.tolerancePercent / 100);
  
  // Check supports
  for (const support of supports) {
    if (Math.abs(price - support.price) <= tolerance) {
      return {
        near: true,
        type: 'support',
        level: support.price,
        strength: support.strength,
        distance: ((price - support.price) / price * 100).toFixed(2) + '% above'
      };
    }
  }
  
  // Check resistances
  for (const resistance of resistances) {
    if (Math.abs(price - resistance.price) <= tolerance) {
      return {
        near: true,
        type: 'resistance',
        level: resistance.price,
        strength: resistance.strength,
        distance: ((resistance.price - price) / price * 100).toFixed(2) + '% below'
      };
    }
  }
  
  return { near: false };
}

/**
 * Get optimal entry near support
 */
function getOptimalEntry(direction, price, supports, resistances) {
  const tolerance = price * 0.005; // 0.5% tolerance
  
  if (direction === 'LONG') {
    // Find nearest support below
    const validSupports = supports.filter(s => s.price < price);
    if (validSupports.length > 0) {
      const nearest = validSupports.sort((a, b) => b.price - a.price)[0];
      if (price - nearest.price <= tolerance) {
        return {
          recommended: true,
          entry: nearest.price,
          reason: `Near support at ${nearest.price} (strength: ${nearest.strength}%)`
        };
      }
    }
  } else if (direction === 'SHORT') {
    // Find nearest resistance above
    const validResistances = resistances.filter(r => r.price > price);
    if (validResistances.length > 0) {
      const nearest = validResistances.sort((a, b) => a.price - b.price)[0];
      if (nearest.price - price <= tolerance) {
        return {
          recommended: true,
          entry: nearest.price,
          reason: `Near resistance at ${nearest.price} (strength: ${nearest.strength}%)`
        };
      }
    }
  }
  
  return {
    recommended: false,
    entry: price,
    reason: 'No significant S/R nearby'
  };
}

/**
 * Calculate stop loss near support/resistance
 */
function calculateSRLoss(direction, entry, supports, resistances, atr) {
  const atrBuffer = atr * 1.5;
  
  if (direction === 'LONG') {
    // Stop loss just below support
    const validSupports = supports.filter(s => s.price < entry);
    if (validSupports.length > 0) {
      const nearest = validSupports.sort((a, b) => b.price - a.price)[0];
      const stop = Math.min(nearest.price - atrBuffer, entry * 0.98);
      return parseFloat(stop.toFixed(8));
    }
  } else if (direction === 'SHORT') {
    // Stop loss just above resistance
    const validResistances = resistances.filter(r => r.price > entry);
    if (validResistances.length > 0) {
      const nearest = validResistances.sort((a, b) => a.price - b.price)[0];
      const stop = Math.max(nearest.price + atrBuffer, entry * 1.02);
      return parseFloat(stop.toFixed(8));
    }
  }
  
  return direction === 'LONG' ? entry * 0.98 : entry * 1.02;
}

/**
 * Calculate take profit near resistance/support
 */
function calculateSRProfit(direction, entry, supports, resistances, riskAmount) {
  const risk = direction === 'LONG' ? entry - calculateSRLoss(direction, entry, supports, resistances, 0) 
                       : calculateSRLoss(direction, entry, supports, resistances, 0) - entry;
  
  // Minimum 2:1 risk:reward
  const minTarget = risk * 2;
  
  if (direction === 'LONG') {
    // Take profit near resistance
    const validResistances = resistances.filter(r => r.price > entry);
    if (validResistances.length > 0) {
      const nearest = validResistances.sort((a, b) => a.price - b.price)[0];
      const target = nearest.price;
      if (target - entry >= minTarget) {
        return parseFloat(target.toFixed(8));
      }
    }
    // Fallback to 2:1
    return parseFloat((entry + minTarget).toFixed(8));
    
  } else {
    // Take profit near support
    const validSupports = supports.filter(s => s.price < entry);
    if (validSupports.length > 0) {
      const nearest = validSupports.sort((a, b) => b.price - a.price)[0];
      const target = nearest.price;
      if (entry - target >= minTarget) {
        return parseFloat(target.toFixed(8));
      }
    }
    return parseFloat((entry - minTarget).toFixed(8));
  }
}

module.exports = {
  CONFIG,
  findSupportResistance,
  checkNearLevel,
  getOptimalEntry,
  calculateSRLoss,
  calculateSRProfit
};
