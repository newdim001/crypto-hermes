/**
 * Signal Decorrelation Engine
 * Prevents correlated signals from getting double-weighted
 */

class SignalDecorrelator {
  constructor() {
    this.correlationThreshold = 0.7;
    this.signalHistory = [];
    this.lastRegimeCheck = null;
  }

  // Calculate correlation between two signals
  calculateCorrelation(signalA, signalB) {
    if (signalA.length !== signalB.length) return 0;
    
    const meanA = signalA.reduce((a, b) => a + b, 0) / signalA.length;
    const meanB = signalB.reduce((a, b) => a + b, 0) / signalB.length;
    
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < signalA.length; i++) {
      const diffA = signalA[i] - meanA;
      const diffB = signalB[i] - meanB;
      num += diffA * diffB;
      denA += diffA * diffA;
      denB += diffB * diffB;
    }
    
    return denA === 0 || denB === 0 ? 0 : num / Math.sqrt(denA * denB);
  }

  // Get effective weight after decorrelation
  getEffectiveWeight(signals) {
    const signalNames = Object.keys(signals);
    const weights = {};
    
    // Default weights
    const defaultWeights = {
      technical: 0.5,
      sentiment: 0.3,
      onchain: 0.2,
      momentum: 0.15,
      meanReversion: 0.15,
    };
    
    // Calculate effective weights
    let totalWeight = 0;
    
    signalNames.forEach(name => {
      let weight = defaultWeights[name] || 0.2;
      
      // Check correlation with other signals
      signalNames.forEach(other => {
        if (name !== other) {
          const correlation = this.getCachedCorrelation(name, other);
          if (correlation > this.correlationThreshold) {
            // Reduce weight if highly correlated
            weight *= (1 - correlation * 0.5);
          }
        }
      });
      
      weights[name] = weight;
      totalWeight += weight;
    });
    
    // Normalize weights
    signalNames.forEach(name => {
      weights[name] = weights[name] / totalWeight;
    });
    
    return weights;
  }

  // Get cached correlation
  getCachedCorrelation(signalA, signalB) {
    const key = `${signalA}_${signalB}`;
    // In production, calculate from actual signal history
    // For now, return heuristic correlations
    const correlations = {
      'technical_sentiment': 0.8, // High correlation during stress
      'technical_onchain': 0.7,
      'sentiment_onchain': 0.6,
      'momentum_meanReversion': -0.5, // Negatively correlated
    };
    return correlations[key] || 0.5;
  }

  // Calculate consensus score with decorrelation
  calculateConsensus(technical, sentiment, onchain, momentum, meanReversion) {
    const signals = { technical, sentiment, onchain, momentum, meanReversion };
    const weights = this.getEffectiveWeight(signals);
    
    let consensus = 0;
    Object.keys(signals).forEach(key => {
      consensus += signals[key] * weights[key];
    });
    
    return {
      score: consensus,
      weights,
      isCorrelated: this.isHighlyCorrelated(signals),
    };
  }

  isHighlyCorrelated(signals) {
    const values = Object.values(signals);
    const allPositive = values.every(v => v > 0);
    const allNegative = values.every(v => v < 0);
    return allPositive || allNegative;
  }
}

// Regime transition detector
class RegimeTransitionDetector {
  constructor() {
    this.confidenceThreshold = 0.7;
    this.history = [];
  }

  // Detect if we're in a regime transition
  detectTransition(regime, confidence) {
    if (confidence < this.confidenceThreshold) {
      return {
        isTransitioning: true,
        recommendation: 'REDUCE_SIZE',
        positionMultiplier: 0.5,
        newPositionsAllowed: false,
        reason: 'Low regime confidence - uncertainty period',
      };
    }
    
    return {
      isTransitioning: false,
      recommendation: 'NORMAL',
      positionMultiplier: 1.0,
      newPositionsAllowed: true,
    };
  }

  // Get regime-specific signal weights
  getRegimeWeights(regime) {
    const weights = {
      Strong_Trend: {
        momentum: 0.5,
        meanReversion: 0.0, // Disable mean reversion in trends
        breakout: 0.3,
        rsi: 0.1,
        macd: 0.1,
      },
      Ranging: {
        momentum: 0.1,
        meanReversion: 0.5, // Enable mean reversion in range
        breakout: 0.1,
        rsi: 0.4,
        macd: 0.1,
      },
      Volatile: {
        momentum: 0.2,
        meanReversion: 0.2,
        breakout: 0.2,
        rsi: 0.2,
        macd: 0.2,
      },
      Quiet: {
        momentum: 0.1,
        meanReversion: 0.4,
        breakout: 0.1,
        rsi: 0.3,
        macd: 0.1,
      },
    };
    
    return weights[regime] || weights.Ranging;
  }
}

// Thesis-based exit system
class ThesisBasedExit {
  constructor() {
    this.activeTheses = new Map();
  }

  // Create a trade thesis
  createThesis(tradeId, entryPrice, thesis) {
    this.activeTheses.set(tradeId, {
      entryPrice,
      thesis, // e.g., "bouncing off 200-day MA"
      conditions: thesis.conditions || [],
      invalidationLevels: thesis.invalidationLevels || [],
      createdAt: new Date().toISOString(),
      maxHoldTime: thesis.maxHoldTime || 4 * 60 * 60 * 1000, // 4 hours
    });
  }

  // Check if thesis is invalidated
  checkThesis(tradeId, currentPrice, indicators) {
    const thesis = this.activeTheses.get(tradeId);
    if (!thesis) return { invalidated: false, reason: 'No thesis found' };
    
    // Check time-based invalidation
    const holdTime = Date.now() - new Date(thesis.createdAt).getTime();
    if (holdTime > thesis.maxHoldTime) {
      return { invalidated: true, reason: 'Max hold time exceeded' };
    }
    
    // Check price invalidation levels
    for (const level of thesis.invalidationLevels) {
      if (level.type === 'below' && currentPrice < level.price) {
        return { invalidated: true, reason: `Price below ${level.price}` };
      }
      if (level.type === 'above' && currentPrice > level.price) {
        return { invalidated: true, reason: `Price above ${level.price}` };
      }
    }
    
    // Check condition invalidations
    for (const condition of thesis.conditions) {
      if (!this.evaluateCondition(condition, currentPrice, indicators)) {
        return { invalidated: true, reason: condition.description };
      }
    }
    
    return { invalidated: false, reason: 'Thesis intact' };
  }

  evaluateCondition(condition, price, indicators) {
    switch (condition.type) {
      case 'rsi_above':
        return indicators.rsi > condition.value;
      case 'rsi_below':
        return indicators.rsi < condition.value;
      case 'volume_above':
        return indicators.volume > condition.value;
      case 'divergence':
        return indicators.hasBullishDivergence === condition.value;
      case 'close_above':
        return price > condition.price;
      case 'close_below':
        return price < condition.price;
      default:
        return true;
    }
  }

  // Remove thesis when trade closes
  closeThesis(tradeId) {
    this.activeTheses.delete(tradeId);
  }
}

// Timeframe hierarchy system
class TimeframeHierarchy {
  constructor() {
    this.weights = {
      weekly: 0.4,
      daily: 0.3,
      '4h': 0.2,
      '1h': 0.1,
    };
  }

  // Get weighted signal from multiple timeframes
  calculateMultiTimeframeSignal(timeframeSignals) {
    let totalWeight = 0;
    let weightedSum = 0;
    
    Object.keys(timeframeSignals).forEach(tf => {
      const weight = this.weights[tf] || 0.1;
      const signal = timeframeSignals[tf];
      
      weightedSum += signal * weight;
      totalWeight += weight;
    });
    
    const finalSignal = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Determine trend direction
    const trend = finalSignal > 0.2 ? 'BULLISH' : finalSignal < -0.2 ? 'BEARISH' : 'NEUTRAL';
    
    return {
      signal: finalSignal,
      trend,
      timeframeBreakdown: timeframeSignals,
    };
  }

  // Override lower timeframes if higher disagrees strongly
  shouldOverride(weekly, daily, tf1h) {
    const higherTrend = weekly > 0.1 ? 1 : weekly < -0.1 ? -1 : 0;
    const lowerTrend = tf1h > 0.1 ? 1 : tf1h < -0.1 ? -1 : 0;
    
    // If higher timeframe strongly disagrees, follow it
    if (Math.abs(weekly) > 0.3 && higherTrend !== lowerTrend && Math.abs(tf1h) < 0.3) {
      return {
        override: true,
        reason: `Weekly (${weekly.toFixed(2)}) contradicts 1h (${tf1h.toFixed(2)})`,
        finalSignal: weekly,
      };
    }
    
    return { override: false };
  }
}

// Volume confirmation validator
class VolumeValidator {
  constructor() {
    this.volumeThreshold = 1.5; // Require 1.5x average volume
  }

  validateBreakout(currentVolume, averageVolume, breakoutType = 'any') {
    const volumeRatio = currentVolume / averageVolume;
    
    if (volumeRatio < this.volumeThreshold) {
      return {
        confirmed: false,
        confidence: volumeRatio,
        warning: 'Low volume breakout - likely false',
        recommendation: 'Skip or reduce position to 20%',
      };
    }
    
    return {
      confirmed: true,
      confidence: Math.min(volumeRatio / 3, 1), // Cap at 1
      warning: null,
      recommendation: 'Normal position size',
    };
  }
}

// Structure-based stop loss calculator
class StructureStopLoss {
  calculateStopLoss(entryPrice, tradeType, volatility, supportLevels = {}) {
    const volatilityBuffer = volatility * 1.5; // 1.5x ATR
    
    const stops = {
      Support_Bounce: {
        stop: supportLevels.support - volatilityBuffer,
        reason: 'Below support level',
      },
      Breakout: {
        stop: supportLevels.breakoutLevel - volatilityBuffer,
        reason: 'Below breakout point',
      },
      Momentum: {
        stop: supportLevels.swingLow - volatilityBuffer,
        reason: 'Below recent swing low',
      },
      Mean_Reversion: {
        stop: entryPrice * 0.97, // Tighter stop for reversions
        reason: 'Fixed 3% for reversion trades',
      },
      Default: {
        stop: entryPrice * 0.98, // Default 2%
        reason: 'Fixed 2% stop',
      },
    };
    
    const selected = stops[tradeType] || stops.Default;
    
    return {
      stopPrice: selected.stop,
      stopPercent: ((entryPrice - selected.stop) / entryPrice * 100).toFixed(2),
      reason: selected.reason,
    };
  }
}

module.exports = {
  SignalDecorrelator,
  RegimeTransitionDetector,
  ThesisBasedExit,
  TimeframeHierarchy,
  VolumeValidator,
  StructureStopLoss,
};
