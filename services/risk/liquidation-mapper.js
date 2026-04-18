/**
 * Liquidation Level Mapper
 * Identifies cascade price levels and avoids stop hunts
 */

const axios = require('axios');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Pool thresholds (USD)
  largePoolThreshold: 1000000,  // $1M+ = whale pool
  mediumPoolThreshold: 100000, // $100k+
  
  // Liquidation zones
  clusterThresholdPercent: 2,   // Group liquidations within 2%
  maxLiquidationClusters: 5,   // Top 5 clusters only
  
  // Avoidance zones
  liquidationBufferPercent: 3, // Keep 3% away from liquidation levels
  openInterestWeight: 0.7       // Weight for OI in calculations
};

// ============================================
// DATA SOURCES
// ============================================

async function getOpenInterest(symbol) {
  try {
    const response = await axios.get('https://fapi.binance.com/futures/data/openInterestHist', {
      params: {
        symbol: symbol.replace('USDT', ''),
        period: '1h',
        limit: 24
      }
    });
    return response.data.map(d => ({
      time: d.timestamp,
      openInterest: parseFloat(d.sumOpenInterest)
    }));
  } catch (e) {
    console.log(`   ⚠️ OI data unavailable for ${symbol}`);
    return [];
  }
}

async function getLiquidationData(symbol) {
  // Binance doesn't provide historical liquidations directly
  // Use a proxy: large volume clusters often indicate liquidation zones
  try {
    const response = await axios.get('https://fapi.binance.com/futures/data/longShortRatio', {
      params: {
        symbol: symbol.replace('USDT', ''),
        period: '1h',
        limit: 24
      }
    });
    return response.data.map(d => ({
      time: d.timestamp,
      longRatio: parseFloat(d.longShortRatio),
      longVol: parseFloat(d.longVolume),
      shortVol: parseFloat(d.shortVolume)
    }));
  } catch (e) {
    return [];
  }
}

// ============================================
// LIQUIDATION CLUSTER DETECTION
// ============================================

function findLiquidationClusters(prices, volumes) {
  if (prices.length < 10) return [];
  
  // Group prices into clusters
  const clusters = [];
  const sorted = prices.map((p, i) => ({ price: p, volume: volumes[i] }))
    .sort((a, b) => b.volume - a.volume);
  
  // Find top volume areas (likely liquidation zones)
  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  const threshold = totalVolume * 0.1; // Top 10% volume areas
  
  let clusterCenter = null;
  let clusterVolume = 0;
  const clusterPrices = [];
  
  for (const item of sorted) {
    if (clusterCenter === null) {
      clusterCenter = item.price;
      clusterVolume = item.volume;
      clusterPrices.push(item.price);
    } else {
      const deviation = Math.abs(item.price - clusterCenter) / clusterCenter * 100;
      if (deviation < CONFIG.liquidationBufferPercent) {
        clusterVolume += item.volume;
        clusterPrices.push(item.price);
      } else {
        if (clusterVolume >= threshold) {
          clusters.push({
            center: clusterCenter,
            volume: clusterVolume,
            prices: clusterPrices
          });
        }
        clusterCenter = item.price;
        clusterVolume = item.volume;
        clusterPrices.length = 0;
        clusterPrices.push(item.price);
      }
    }
  }
  
  return clusters
    .sort((a, b) => b.volume - a.volume)
    .slice(0, CONFIG.maxLiquidationClusters);
}

// ============================================
// LIQUIDATION ZONE CALCULATION
// ============================================

async function analyzeLiquidationZones(symbol, currentPrice) {
  console.log(`\n🔍 Analyzing liquidation zones for ${symbol}...`);
  
  const oiData = await getOpenInterest(symbol);
  const liqData = await getLiquidationData(symbol);
  
  // Calculate OI-based liquidation zones
  // When price moves X%, Y% of positions get liquidated
  const zones = [];
  
  if (oiData.length > 0) {
    const totalOI = oiData[oiData.length - 1].openInterest;
    const avgPrice = currentPrice;
    
    // Estimate liquidation levels based on OI concentration
    // Conservative: assume 20-30% of positions liquidate on 10% price move
    const liquidationRange = 0.10; // 10% price move
    
    // Long liquidation zone (price drops)
    const longLiqLevel = avgPrice * (1 - liquidationRange);
    // Short liquidation zone (price rises)
    const shortLiqLevel = avgPrice * (1 + liquidationRange);
    
    zones.push({
      type: 'LONG_LIQUIDATION',
      level: longLiqLevel,
      distance: ((currentPrice - longLiqLevel) / currentPrice * 100).toFixed(2),
      severity: totalOI > CONFIG.largePoolThreshold ? 'HIGH' : 'MEDIUM',
      confidence: 'MEDIUM',
      source: 'OPEN_INTEREST'
    });
    
    zones.push({
      type: 'SHORT_LIQUIDATION',
      level: shortLiqLevel,
      distance: ((shortLiqLevel - currentPrice) / currentPrice * 100).toFixed(2),
      severity: totalOI > CONFIG.largePoolThreshold ? 'HIGH' : 'MEDIUM',
      confidence: 'MEDIUM',
      source: 'OPEN_INTEREST'
    });
    
    console.log(`   📊 OI: $${(totalOI * currentPrice / 1000000).toFixed(1)}M equivalent`);
  }
  
  // Analyze long/short ratio for extreme zones
  if (liqData.length > 0) {
    const recent = liqData.slice(-5);
    const avgLongRatio = recent.reduce((s, d) => s + d.longRatio, 0) / recent.length;
    
    // If ratio > 3:1 or < 1:3, likely extreme
    if (avgLongRatio > 3) {
      zones.push({
        type: 'LONG_SQUEEZE_RISK',
        level: currentPrice * 1.05, // 5% upside
        distance: '5',
        severity: 'HIGH',
        confidence: 'HIGH',
        source: 'LONG_SHORT_RATIO'
      });
    } else if (avgLongRatio < 0.33) {
      zones.push({
        type: 'SHORT_SQUEEZE_RISK',
        level: currentPrice * 0.95, // 5% downside
        distance: '5',
        severity: 'HIGH',
        confidence: 'HIGH',
        source: 'LONG_SHORT_RATIO'
      });
    }
  }
  
  return {
    symbol,
    currentPrice,
    timestamp: Date.now(),
    zones: zones.sort((a, b) => {
      const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    recommendation: generateRecommendation(zones, currentPrice)
  };
}

function generateRecommendation(zones, currentPrice) {
  if (zones.length === 0) {
    return { action: 'CLEAR', message: 'No significant liquidation zones detected' };
  }
  
  const highSeverity = zones.filter(z => z.severity === 'HIGH');
  
  if (highSeverity.length >= 2) {
    return {
      action: 'AVOID',
      message: `⚠️ ${highSeverity.length} HIGH severity zones detected - avoid placing stops near current price`
    };
  }
  
  // Check if current price is near a zone
  const nearestZone = zones.find(z => {
    const distance = Math.abs(currentPrice - z.level) / currentPrice * 100;
    return distance < CONFIG.liquidationBufferPercent;
  });
  
  if (nearestZone) {
    return {
      action: 'ADJUST_STOP',
      message: `Stop is ${nearestZone.distance}% from ${nearestZone.type} zone - recommend moving ${CONFIG.liquidationBufferPercent}% further`
    };
  }
  
  return { action: 'CLEAR', message: 'Current levels appear safe for stop placement' };
}

// ============================================
// STOP PLACEMENT OPTIMIZER
// ============================================

function optimizeStopPlacement(entryPrice, direction, liquidationAnalysis, volatility) {
  const currentPrice = liquidationAnalysis.currentPrice;
  const zones = liquidationAnalysis.zones;
  
  // Base stop: 2% (from config)
  let stopPercent = 2;
  
  // Adjust based on liquidation zones
  let recommendedStop;
  
  if (direction === 'LONG') {
    const nearestDownZone = zones
      .filter(z => z.level < currentPrice)
      .sort((a, b) => b.level - a.level)[0];
    
    if (nearestDownZone) {
      const zoneDistance = (currentPrice - nearestDownZone.level) / currentPrice * 100;
      
      // If liquidation zone is close, widen stop
      if (zoneDistance < 5) {
        stopPercent = Math.max(stopPercent, zoneDistance - CONFIG.liquidationBufferPercent);
      }
    }
    
    recommendedStop = entryPrice * (1 - stopPercent / 100);
    
    // Ensure stop is below liquidation zones
    const criticalLevel = currentPrice * 0.95; // 5% below current
    if (recommendedStop < criticalLevel && nearestDownZone && nearestDownZone.level > criticalLevel) {
      recommendedStop = criticalLevel;
    }
  } else {
    const nearestUpZone = zones
      .filter(z => z.level > currentPrice)
      .sort((a, b) => a.level - b.level)[0];
    
    if (nearestUpZone) {
      const zoneDistance = (nearestUpZone.level - currentPrice) / currentPrice * 100;
      
      if (zoneDistance < 5) {
        stopPercent = Math.max(stopPercent, zoneDistance - CONFIG.liquidationBufferPercent);
      }
    }
    
    recommendedStop = entryPrice * (1 + stopPercent / 100);
    
    const criticalLevel = currentPrice * 1.05;
    if (recommendedStop > criticalLevel && nearestUpZone && nearestUpZone.level < criticalLevel) {
      recommendedStop = criticalLevel;
    }
  }
  
  return {
    recommendedStop,
    stopPercent,
    adjustedForLiquidation: stopPercent > 2,
    reason: stopPercent > 2 ? 'Widened to avoid liquidation cascade' : 'Standard stop'
  };
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  analyzeLiquidationZones,
  optimizeStopPlacement,
  getOpenInterest,
  getLiquidationData
};

// CLI
if (require.main === module) {
  const symbol = process.argv[2] || 'BTCUSDT';
  
  (async () => {
    const priceResponse = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const currentPrice = parseFloat(priceResponse.data.price);
    
    const analysis = await analyzeLiquidationZones(symbol, currentPrice);
    
    console.log('\n📊 LIQUIDATION ANALYSIS:');
    console.log(`   Current Price: $${currentPrice}`);
    console.log('\n   ZONES:');
    analysis.zones.forEach(z => {
      console.log(`   • ${z.type}: $${z.level.toFixed(2)} (${z.distance}% away) [${z.severity}]`);
    });
    console.log(`\n   RECOMMENDATION: ${analysis.recommendation.message}`);
  })();
}
