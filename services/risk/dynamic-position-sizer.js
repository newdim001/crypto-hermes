/**
 * Dynamic Position Sizer v2
 * Calculates optimal position size based on risk, confidence, and market conditions
 */

const CONFIG = {
  // Base risk parameters
  baseRiskPercent: 2, // 2% of account per trade
  maxRiskPercent: 5, // Maximum risk allowed
  minRiskPercent: 0.5, // Minimum risk for high confidence
  
  // Kelly Criterion settings
  kellyFraction: 0.25, // Use 25% of Kelly (conservative)
  
  // Volatility adjustment
  highVolatilityThreshold: 3, // ATR > 3% of price = high volatility
  lowVolatilityThreshold: 1, // ATR < 1% of price = low volatility
  
  // Confidence multipliers
  confidenceWeights: {
    90: 1.5, // 90%+ confidence = increase size
    75: 1.25, // 75%+ confidence = slightly increase
    60: 1.0, // 60%+ confidence = normal size
    50: 0.75, // 50-60% confidence = reduce size
    40: 0.5 // <50% = minimal size
  },
  
  // Account limits
  maxPositions: 3,
  maxDailyLoss: 5, // 5% max daily loss
  maxDrawdown: 15 // 15% max drawdown from peak
};

/**
 * Calculate optimal position size
 */
function calculatePositionSize(params) {
  const {
    accountBalance,
    entryPrice,
    stopLossPrice,
    confidence,
    atr,
    recentLosses = 0,
    consecutiveLosses = 0,
    dailyPnL = 0,
    currentDrawdown = 0
  } = params;
  
  // 1. Calculate base position size from risk
  const riskAmount = accountBalance * (CONFIG.baseRiskPercent / 100);
  const priceRisk = Math.abs(entryPrice - stopLossPrice);
  
  if (priceRisk === 0) return 0;
  
  let positionSize = riskAmount / priceRisk;
  
  // 2. Adjust for volatility
  const atrPercent = (atr / entryPrice) * 100;
  
  if (atrPercent > CONFIG.highVolatilityThreshold) {
    // High volatility - reduce position size
    positionSize *= 0.7;
  } else if (atrPercent < CONFIG.lowVolatilityThreshold) {
    // Low volatility - can increase slightly
    positionSize *= 1.2;
  }
  
  // 3. Adjust for confidence
  const confidenceMultiplier = getConfidenceMultiplier(confidence);
  positionSize *= confidenceMultiplier;
  
  // 4. Apply Kelly Criterion if we have win rate data
  const kellySize = applyKellyCriterion(accountBalance, positionSize);
  if (kellySize > 0) {
    positionSize = Math.min(positionSize, kellySize);
  }
  
  // 5. Risk-on streak adjustment
  if (consecutiveLosses >= 3) {
    // Reduce size after 3 consecutive losses
    positionSize *= 0.5;
  } else if (consecutiveLosses >= 2) {
    positionSize *= 0.75;
  }
  
  // 6. Daily loss check
  const dailyLossPercent = Math.abs(dailyPnL / accountBalance * 100);
  if (dailyLossPercent >= CONFIG.maxDailyLoss - 1) {
    // Very close to daily loss limit - reduce significantly
    positionSize *= 0.25;
  } else if (dailyLossPercent >= CONFIG.maxDailyLoss - 2) {
    positionSize *= 0.5;
  }
  
  // 7. Drawdown check
  if (currentDrawdown >= CONFIG.maxDrawdown - 5) {
    positionSize *= 0.2;
  } else if (currentDrawdown >= CONFIG.maxDrawdown - 10) {
    positionSize *= 0.5;
  }
  
  // 8. Ensure within limits
  const maxPositionValue = accountBalance * (CONFIG.maxRiskPercent / 100);
  const maxSize = maxPositionValue / entryPrice;
  
  positionSize = Math.min(positionSize, maxSize);
  positionSize = Math.max(positionSize, 0); // Can't be negative
  
  return {
    quantity: parseFloat(positionSize.toFixed(6)),
    value: parseFloat((positionSize * entryPrice).toFixed(2)),
    riskAmount: parseFloat((positionSize * priceRisk).toFixed(2)),
    riskPercent: parseFloat(((positionSize * priceRisk) / accountBalance * 100).toFixed(2)),
    adjustments: {
      volatility: atrPercent > CONFIG.highVolatilityThreshold ? 'reduced' : 
                  atrPercent < CONFIG.lowVolatilityThreshold ? 'increased' : 'normal',
      confidence: confidenceMultiplier > 1 ? 'increased' : confidenceMultiplier < 1 ? 'reduced' : 'normal',
      streak: consecutiveLosses >= 2 ? `reduced (${consecutiveLosses} losses)` : 'normal',
      dailyLoss: dailyLossPercent >= CONFIG.maxDailyLoss - 2 ? 'significantly_reduced' : 'normal'
    }
  };
}

/**
 * Get confidence multiplier
 */
function getConfidenceMultiplier(confidence) {
  if (confidence >= 90) return CONFIG.confidenceWeights[90];
  if (confidence >= 75) return CONFIG.confidenceWeights[75];
  if (confidence >= 60) return CONFIG.confidenceWeights[60];
  if (confidence >= 50) return CONFIG.confidenceWeights[50];
  return CONFIG.confidenceWeights[40];
}

/**
 * Apply Kelly Criterion
 */
function applyKellyCriterion(accountBalance, proposedSize) {
  // We'd need win rate and avg win/loss from historical data
  // For now, return 0 to skip Kelly
  // In production, calculate:
  // Kelly % = W - (1-W)/R
  // where W = win rate, R = avg win / avg loss
  
  return 0; // Disabled for safety
}

/**
 * Calculate suggested stop loss based on ATR
 */
function calculateStopLoss(direction, entryPrice, atr, adx = 25) {
  const atrMultiplier = adx > 25 ? 2.5 : adx > 20 ? 2 : 1.5;
  
  if (direction === 'LONG') {
    return entryPrice - (atr * atrMultiplier);
  } else if (direction === 'SHORT') {
    return entryPrice + (atr * atrMultiplier);
  }
  return entryPrice * 0.98;
}

/**
 * Calculate suggested take profit based on risk:reward
 */
function calculateTakeProfit(direction, entryPrice, stopLoss, minRR = 2) {
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = risk * minRR;
  
  if (direction === 'LONG') {
    return entryPrice + reward;
  } else if (direction === 'SHORT') {
    return entryPrice - reward;
  }
  return entryPrice * 1.04;
}

/**
 * Check if we should take this trade based on position limits
 */
function shouldTakeTrade(params) {
  const {
    currentPositions,
    dailyTrades,
    dailyLossPercent,
    currentDrawdown
  } = params;
  
  // Check position limit
  if (currentPositions >= CONFIG.maxPositions) {
    return { allowed: false, reason: 'Max positions reached' };
  }
  
  // Check daily trade limit
  if (dailyTrades >= 20) {
    return { allowed: false, reason: 'Daily trade limit reached' };
  }
  
  // Check daily loss limit
  if (dailyLossPercent >= CONFIG.maxDailyLoss) {
    return { allowed: false, reason: 'Daily loss limit reached' };
  }
  
  // Check drawdown limit
  if (currentDrawdown >= CONFIG.maxDrawdown) {
    return { allowed: false, reason: 'Max drawdown reached' };
  }
  
  return { allowed: true, reason: 'OK' };
}

/**
 * Get current risk status
 */
function getRiskStatus(accountBalance, peakBalance, dailyPnL) {
  const drawdown = ((peakBalance - accountBalance) / peakBalance) * 100;
  const dailyLoss = Math.abs(dailyPnL / accountBalance * 100);
  
  let status = 'NORMAL';
  let alertLevel = 'green';
  
  if (drawdown >= CONFIG.maxDrawdown || dailyLoss >= CONFIG.maxDailyLoss) {
    status = 'HALTED';
    alertLevel = 'red';
  } else if (drawdown >= CONFIG.maxDrawdown - 5 || dailyLoss >= CONFIG.maxDailyLoss - 1) {
    status = 'WARNING';
    alertLevel = 'yellow';
  }
  
  return {
    status,
    alertLevel,
    drawdown: drawdown.toFixed(2),
    dailyLoss: dailyLoss.toFixed(2),
    maxDailyLoss: CONFIG.maxDailyLoss,
    maxDrawdown: CONFIG.maxDrawdown
  };
}

module.exports = {
  CONFIG,
  calculatePositionSize,
  calculateStopLoss,
  calculateTakeProfit,
  shouldTakeTrade,
  getRiskStatus
};
