/**
 * Correlation-Based Position Sizer
 * Adjusts position sizes based on portfolio correlation
 */

const axios = require('axios');

// ============================================
// CORRELATION MATRIX (Major cryptos)
// ============================================

const CORRELATION_MATRIX = {
  'BTCUSDT': { 'ETHUSDT': 0.75, 'BNBUSDT': 0.65, 'SOLUSDT': 0.55, 'XRPUSDT': 0.45, 'ADAUSDT': 0.50, 'DOGEUSDT': 0.40, 'AVAXUSDT': 0.52, 'DOTUSDT': 0.48, 'POLUSDT': 0.45 },
  'ETHUSDT': { 'BTCUSDT': 0.75, 'BNBUSDT': 0.70, 'SOLUSDT': 0.60, 'XRPUSDT': 0.50, 'ADAUSDT': 0.55, 'DOGEUSDT': 0.42, 'AVAXUSDT': 0.58, 'DOTUSDT': 0.52, 'POLUSDT': 0.50 },
  'BNBUSDT': { 'BTCUSDT': 0.65, 'ETHUSDT': 0.70, 'SOLUSDT': 0.55, 'XRPUSDT': 0.45, 'ADAUSDT': 0.50, 'DOGEUSDT': 0.38, 'AVAXUSDT': 0.55, 'DOTUSDT': 0.48, 'POLUSDT': 0.45 },
  'SOLUSDT': { 'BTCUSDT': 0.55, 'ETHUSDT': 0.60, 'BNBUSDT': 0.55, 'XRPUSDT': 0.50, 'ADAUSDT': 0.60, 'DOGEUSDT': 0.55, 'AVAXUSDT': 0.65, 'DOTUSDT': 0.55, 'POLUSDT': 0.52 },
  'XRPUSDT': { 'BTCUSDT': 0.45, 'ETHUSDT': 0.50, 'BNBUSDT': 0.45, 'SOLUSDT': 0.50, 'ADAUSDT': 0.55, 'DOGEUSDT': 0.40, 'AVAXUSDT': 0.48, 'DOTUSDT': 0.45, 'POLUSDT': 0.42 },
  'ADAUSDT': { 'BTCUSDT': 0.50, 'ETHUSDT': 0.55, 'BNBUSDT': 0.50, 'SOLUSDT': 0.60, 'XRPUSDT': 0.55, 'DOGEUSDT': 0.45, 'AVAXUSDT': 0.52, 'DOTUSDT': 0.50, 'POLUSDT': 0.55 },
  'DOGEUSDT': { 'BTCUSDT': 0.40, 'ETHUSDT': 0.42, 'BNBUSDT': 0.38, 'SOLUSDT': 0.55, 'XRPUSDT': 0.40, 'ADAUSDT': 0.45, 'AVAXUSDT': 0.42, 'DOTUSDT': 0.38, 'POLUSDT': 0.40 },
  'AVAXUSDT': { 'BTCUSDT': 0.52, 'ETHUSDT': 0.58, 'BNBUSDT': 0.55, 'SOLUSDT': 0.65, 'XRPUSDT': 0.48, 'ADAUSDT': 0.52, 'DOGEUSDT': 0.42, 'DOTUSDT': 0.58, 'POLUSDT': 0.50 },
  'DOTUSDT': { 'BTCUSDT': 0.48, 'ETHUSDT': 0.52, 'BNBUSDT': 0.48, 'SOLUSDT': 0.55, 'XRPUSDT': 0.45, 'ADAUSDT': 0.50, 'DOGEUSDT': 0.38, 'AVAXUSDT': 0.58, 'POLUSDT': 0.55 },
  'POLUSDT': { 'BTCUSDT': 0.45, 'ETHUSDT': 0.50, 'BNBUSDT': 0.45, 'SOLUSDT': 0.52, 'XRPUSDT': 0.42, 'ADAUSDT': 0.55, 'DOGEUSDT': 0.40, 'AVAXUSDT': 0.50, 'DOTUSDT': 0.55 }
};

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  maxCorrelationExposure: 0.60,  // Max 60% in highly correlated assets
  maxSinglePosition: 0.15,       // Max 15% in single asset
  correlationThreshold: 0.60,    // Consider "high" correlation above this
  minCorrelationReduction: 0.5, // Reduce size by at least 50% for high correlation
  riskParityEnabled: true         // Enable risk parity calculation
};

// ============================================
// CORRELATION CALCULATOR
// ============================================

function getCorrelation(asset1, asset2) {
  if (asset1 === asset2) return 1;
  return CORRELATION_MATRIX[asset1]?.[asset2] || 0.3; // Default to 0.3 if unknown
}

function calculatePortfolioCorrelation(newAsset, existingPositions) {
  if (!existingPositions || existingPositions.length === 0) {
    return { avgCorrelation: 0, maxCorrelation: 0, totalExposure: 0 };
  }
  
  let totalCorrelation = 0;
  let maxCorrelation = 0;
  
  for (const position of existingPositions) {
    const corr = getCorrelation(newAsset, position.symbol);
    totalCorrelation += corr * position.weight;
    maxCorrelation = Math.max(maxCorrelation, corr);
  }
  
  return {
    avgCorrelation: totalCorrelation,
    maxCorrelation,
    isHighlyCorrelated: maxCorrelation >= CONFIG.correlationThreshold
  };
}

// ============================================
// RISK PARITY CALCULATOR
// ============================================

function calculateRiskParity(assets, volatilities, targetVol = 0.15) {
  // Risk parity: allocate based on inverse volatility
  const invVol = assets.map((a, i) => 1 / (volatilities[i] || 1));
  const totalInvVol = invVol.reduce((a, b) => a + b, 0);
  
  return assets.map((a, i) => ({
    asset: a,
    weight: (invVol[i] / totalInvVol) * targetVol
  }));
}

// ============================================
// MAIN POSITION SIZE CALCULATOR
// ============================================

function calculateCorrelationAdjustedSize(params) {
  const {
    baseSize,           // Base position size from standard calculation
    newAsset,           // Symbol trying to buy
    existingPositions = [], // [{symbol, weight, size}]
    balance,            // Total portfolio balance
    maxPosition = CONFIG.maxSinglePosition
  } = params;
  
  // Step 1: Check single position limit
  let adjustedSize = Math.min(baseSize, balance * maxPosition);
  
  // Step 2: Calculate correlation impact
  const corrAnalysis = calculatePortfolioCorrelation(newAsset, existingPositions);
  
  // Step 3: Apply correlation reduction
  let correlationMultiplier = 1;
  let reductionReason = '';
  
  if (corrAnalysis.isHighlyCorrelated) {
    // High correlation - reduce size
    correlationMultiplier = CONFIG.minCorrelationReduction;
    reductionReason = `High correlation (${corrAnalysis.maxCorrelation.toFixed(2)}) with existing positions`;
  } else if (corrAnalysis.avgCorrelation > 0.4) {
    // Moderate correlation - slightly reduce
    correlationMultiplier = 0.75;
    reductionReason = `Moderate correlation (${corrAnalysis.avgCorrelation.toFixed(2)})`;
  }
  
  adjustedSize = adjustedSize * correlationMultiplier;
  
  // Step 4: Check total portfolio correlation exposure
  let totalHighCorrExposure = 0;
  for (const pos of existingPositions) {
    if (corrAnalysis.maxCorrelation >= CONFIG.correlationThreshold) {
      totalHighCorrExposure += pos.weight;
    }
  }
  
  if (totalHighCorrExposure + (adjustedSize / balance) > CONFIG.maxCorrelationExposure) {
    const excess = (totalHighCorrExposure + (adjustedSize / balance)) - CONFIG.maxCorrelationExposure;
    adjustedSize = adjustedSize * (1 - excess);
    reductionReason += ' | Total correlation exposure limit reached';
  }
  
  return {
    originalSize: baseSize,
    adjustedSize: adjustedSize.toFixed(2),
    correlationMultiplier: correlationMultiplier.toFixed(2),
    correlationAnalysis: {
      avgCorrelation: corrAnalysis.avgCorrelation.toFixed(2),
      maxCorrelation: corrAnalysis.maxCorrelation.toFixed(2),
      isHighlyCorrelated: corrAnalysis.isHighlyCorrelated
    },
    reductionReason,
    finalPercent: ((adjustedSize / balance) * 100).toFixed(2),
    riskParity: CONFIG.riskParityEnabled 
      ? calculateRiskParity(existingPositions.map(p => p.symbol), existingPositions.map(p => p.volatility || 1))
      : null
  };
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  calculateCorrelationAdjustedSize,
  calculateRiskParity,
  getCorrelation,
  calculatePortfolioCorrelation,
  CONFIG,
  CORRELATION_MATRIX
};

// CLI Test
if (require.main === module) {
  console.log('🧪 Testing Correlation-Based Position Sizing:\n');
  
  // Test: Adding SOL to portfolio with BTC and ETH
  const result = calculateCorrelationAdjustedSize({
    baseSize: 1000,
    newAsset: 'SOLUSDT',
    existingPositions: [
      { symbol: 'BTCUSDT', weight: 0.5, size: 5000 },
      { symbol: 'ETHUSDT', weight: 0.3, size: 3000 }
    ],
    balance: 10000,
    maxPosition: 0.15
  });
  
  console.log('Adding SOLUSDT to portfolio with BTC (50%) and ETH (30%):');
  console.log(JSON.stringify(result, null, 2));
  
  console.log('\n---\n');
  
  // Test: Adding uncorrelated asset
  const result2 = calculateCorrelationAdjustedSize({
    baseSize: 1000,
    newAsset: 'DOGEUSDT', // Lower correlation
    existingPositions: [
      { symbol: 'BTCUSDT', weight: 0.5, size: 5000 }
    ],
    balance: 10000
  });
  
  console.log('Adding DOGEUSDT to portfolio with BTC only:');
  console.log(JSON.stringify(result2, null, 2));
}
