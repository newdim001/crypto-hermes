/**
 * Shadow Learning System v2
 * Learns from simulated trades and updates brain weights
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');

const CONFIG = {
  // Learning thresholds
  minSignalsBeforeUpdate: 50,
  accuracyThresholdForLive: 55, // Switch to live if accuracy > 55%
  minAccuracyForUpdate: 45, // Only update brain if accuracy > 45%
  
  // Signal tracking
  evaluationHours: 4, // Evaluate signal after 4 hours
  confidenceThreshold: 60,
  
  // Learning rate
  weightAdjustmentRate: 0.1, // How much to adjust weights
  momentumFactor: 0.8 // Keep some of old weights
};

/**
 * Main shadow learning controller
 */
class ShadowLearning {
  constructor() {
    this.brain = this.loadBrain();
    this.shadowSignals = this.loadShadowSignals();
    this.learningHistory = [];
  }
  
  /**
   * Load brain weights
   */
  loadBrain() {
    try {
      const brainPath = path.join(DATA_DIR, 'brain.json');
      return JSON.parse(fs.readFileSync(brainPath, 'utf8'));
    } catch (e) {
      return { weights: this.getDefaultWeights(), symbolStats: {} };
    }
  }
  
  /**
   * Get default weights
   */
  getDefaultWeights() {
    return {
      rsi: 10,
      macd: 10,
      ema: 10,
      bb: 10,
      stochastic: 10,
      adx: 10,
      volume: 10,
      pattern: 10,
      atr: 10,
      cci: 10,
      williamsR: 10,
      mfi: 10,
      roc: 10,
      obv: 10,
      ichimoku: 10
    };
  }
  
  /**
   * Load shadow signals
   */
  loadShadowSignals() {
    try {
      const shadowPath = path.join(DATA_DIR, 'shadow-signals.json');
      return JSON.parse(fs.readFileSync(shadowPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  
  /**
   * Save shadow signals
   */
  saveShadowSignals() {
    const shadowPath = path.join(DATA_DIR, 'shadow-signals.json');
    fs.writeFileSync(shadowPath, JSON.stringify(this.shadowSignals, null, 2));
  }
  
  /**
   * Save brain
   */
  saveBrain() {
    const brainPath = path.join(DATA_DIR, 'brain.json');
    fs.writeFileSync(brainPath, JSON.stringify(this.brain, null, 2));
  }
  
  /**
   * Generate shadow signal and track it
   */
  async generateShadowSignal(symbol, priceData) {
    const indicators = this.calculateIndicators(priceData);
    const signal = this.generateSignal(symbol, indicators);
    
    if (signal.direction === 'HOLD') return null;
    
    const shadowSignal = {
      id: `${symbol}_${Date.now()}`,
      symbol,
      price: priceData[priceData.length - 1].close,
      timestamp: Date.now(),
      evaluateAt: Date.now() + (CONFIG.evaluationHours * 60 * 60 * 1000),
      evaluated: false,
      direction: signal.direction,
      confidence: signal.confidence,
      indicators,
      predictions: signal.predictions,
      consensus: signal.consensus,
      outcome: null,
      priceChange: null,
      wasCorrect: null,
      brainVersion: this.brain.weights ? 'custom' : 'default'
    };
    
    this.shadowSignals.push(shadowSignal);
    this.saveShadowSignals();
    
    return shadowSignal;
  }
  
  /**
   * Evaluate expired shadow signals
   */
  async evaluateShadowSignals(currentPrices) {
    const now = Date.now();
    let updated = false;
    
    for (const signal of this.shadowSignals) {
      if (!signal.evaluated && signal.evaluateAt <= now) {
        const currentPrice = currentPrices[signal.symbol];
        if (!currentPrice) continue;
        
        // Calculate outcome
        const priceChange = (currentPrice - signal.price) / signal.price;
        
        signal.evaluated = true;
        signal.outcome = priceChange * 100;
        
        // Determine if correct
        if (signal.direction === 'LONG') {
          signal.wasCorrect = priceChange > 0;
        } else if (signal.direction === 'SHORT') {
          signal.wasCorrect = priceChange < 0;
        }
        
        // Update symbol stats
        this.updateSymbolStats(signal);
        updated = true;
      }
    }
    
    if (updated) {
      this.saveShadowSignals();
    }
    
    return updated;
  }
  
  /**
   * Update symbol statistics
   */
  updateSymbolStats(signal) {
    if (!this.brain.symbolStats) this.brain.symbolStats = {};
    
    const stats = this.brain.symbolStats[signal.symbol] || {
      wins: 0, losses: 0, totalPnl: 0, consecutiveLosses: 0
    };
    
    if (signal.wasCorrect) {
      stats.wins++;
      stats.consecutiveLosses = 0;
    } else {
      stats.losses++;
      stats.consecutiveLosses++;
    }
    
    stats.totalPnl += signal.priceChange || 0;
    this.brain.symbolStats[signal.symbol] = stats;
  }
  
  /**
   * Learn from shadow signals and update brain
   */
  learn() {
    const evaluated = this.shadowSignals.filter(s => s.evaluated);
    
    if (evaluated.length < CONFIG.minSignalsBeforeUpdate) {
      console.log(`📊 Need ${CONFIG.minSignalsBeforeUpdate - evaluated.length} more signals before learning`);
      return { updated: false, reason: 'insufficient_data' };
    }
    
    // Calculate overall accuracy
    const correct = evaluated.filter(s => s.wasCorrect).length;
    const accuracy = (correct / evaluated.length) * 100;
    
    console.log(`\n🧠 SHADOW LEARNING: Analyzing ${evaluated.length} signals...`);
    console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);
    
    // Only update if accuracy is reasonable
    if (accuracy < CONFIG.minAccuracyForUpdate) {
      console.log(`   Accuracy too low (${accuracy.toFixed(1)}% < ${CONFIG.minAccuracyForUpdate}%) - not updating`);
      return { updated: false, reason: 'accuracy_too_low', accuracy };
    }
    
    // Analyze each indicator's predictive power
    const indicatorAccuracy = this.analyzeIndicatorAccuracy(evaluated);
    
    // Update weights based on accuracy
    this.updateBrainWeights(indicatorAccuracy);
    
    // Record learning
    this.learningHistory.push({
      timestamp: new Date().toISOString(),
      accuracy,
      signals: evaluated.length,
      indicatorAccuracy
    });
    
    // Save updated brain
    this.saveBrain();
    
    console.log(`   ✅ Brain weights updated!`);
    console.log(`   Top indicators:`);
    const sorted = Object.entries(indicatorAccuracy).sort((a, b) => b[1] - a[1]);
    sorted.slice(0, 5).forEach(([ind, acc]) => {
      console.log(`     ${ind}: ${acc.toFixed(1)}%`);
    });
    
    return {
      updated: true,
      accuracy,
      indicatorAccuracy
    };
  }
  
  /**
   * Analyze how accurate each indicator is
   */
  analyzeIndicatorAccuracy(signals) {
    const accuracy = {};
    
    // For each indicator prediction
    for (const signal of signals) {
      if (!signal.predictions) continue;
      
      for (const [indicator, predicted] of Object.entries(signal.predictions)) {
        if (!accuracy[indicator]) {
          accuracy[indicator] = { correct: 0, total: 0 };
        }
        
        accuracy[indicator].total++;
        
        // Check if prediction was correct
        const actualDirection = signal.priceChange > 0 ? 'LONG' : 'SHORT';
        if (predicted === actualDirection || predicted === 'WEAK') {
          accuracy[indicator].correct++;
        }
      }
    }
    
    // Calculate percentage
    const result = {};
    for (const [indicator, data] of Object.entries(accuracy)) {
      result[indicator] = data.total > 0 ? (data.correct / data.total) * 100 : 50;
    }
    
    return result;
  }
  
  /**
   * Update brain weights based on indicator accuracy
   */
  updateBrainWeights(indicatorAccuracy) {
    if (!this.brain.weights) this.brain.weights = this.getDefaultWeights();
    
    const oldWeights = { ...this.brain.weights };
    
    for (const [indicator, newAccuracy] of Object.entries(indicatorAccuracy)) {
      const currentWeight = this.brain.weights[indicator] || 10;
      
      // Convert accuracy to weight (50% accuracy = 10 weight, higher accuracy = higher weight)
      // Scale: 40% acc = 5 weight, 60% acc = 15 weight
      const targetWeight = Math.max(5, Math.min(20, (newAccuracy - 30) * 0.5 + 10));
      
      // Adjust gradually with momentum
      const adjustedWeight = (currentWeight * CONFIG.momentumFactor) + 
                           (targetWeight * (1 - CONFIG.momentumFactor));
      
      this.brain.weights[indicator] = parseFloat(adjustedWeight.toFixed(2));
    }
    
    this.brain.lastUpdated = new Date().toISOString();
    this.brain.version = (this.brain.version || 0) + 1;
  }
  
  /**
   * Generate signal using current brain weights
   */
  generateSignal(symbol, indicators) {
    const weights = this.brain.weights || this.getDefaultWeights();
    
    let score = 0;
    const predictions = {};
    const factors = [];
    
    // RSI
    if (indicators.rsi < 30) {
      predictions.rsi = 'LONG';
      score += weights.rsi * 2;
      factors.push('RSI oversold');
    } else if (indicators.rsi > 70) {
      predictions.rsi = 'SHORT';
      score -= weights.rsi * 2;
      factors.push('RSI overbought');
    } else {
      predictions.rsi = 'WEAK';
    }
    
    // MACD
    if (indicators.macd.histogram > 0) {
      predictions.macd = 'LONG';
      score += weights.macd;
    } else {
      predictions.macd = 'SHORT';
      score -= weights.macd;
    }
    
    // EMA
    if (indicators.ema9 > indicators.ema21) {
      predictions.ema = 'LONG';
      score += weights.ema;
    } else {
      predictions.ema = 'SHORT';
      score -= weights.ema;
    }
    
    // Volume
    predictions.volume = indicators.volumeRatio > 1 ? 'STRONG' : 'WEAK';
    
    // Trend
    if (indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50) {
      predictions.trend = 'LONG';
      score += weights.volume;
    } else if (indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50) {
      predictions.trend = 'SHORT';
      score -= weights.volume;
    } else {
      predictions.trend = 'WEAK';
    }
    
    // Bollinger Bands
    if (indicators.bbPosition < 0.2) {
      predictions.bb = 'LONG';
      score += weights.bb;
    } else if (indicators.bbPosition > 0.8) {
      predictions.bb = 'SHORT';
      score -= weights.bb;
    } else {
      predictions.bb = 'WEAK';
    }
    
    // ADX
    predictions.adx = indicators.adx > 25 ? 'STRONG' : 'WEAK';
    
    // Determine consensus
    const bullishSignals = Object.values(predictions).filter(p => p === 'LONG' || p === 'STRONG').length;
    const bearishSignals = Object.values(predictions).filter(p => p === 'SHORT').length;
    
    let consensus = 'HOLD';
    if (bullishSignals > bearishSignals + 2) consensus = 'LONG';
    else if (bearishSignals > bullishSignals + 2) consensus = 'SHORT';
    
    let direction = 'HOLD';
    let confidence = 0;
    
    if (score > 20 && consensus === 'LONG') {
      direction = 'LONG';
      confidence = Math.min(90, 50 + score);
    } else if (score < -20 && consensus === 'SHORT') {
      direction = 'SHORT';
      confidence = Math.min(90, 50 + Math.abs(score));
    }
    
    return { direction, confidence, predictions, consensus, score, factors };
  }
  
  /**
   * Calculate technical indicators
   */
  calculateIndicators(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    
    return {
      rsi: this.calculateRSI(closes),
      macd: this.calculateMACD(closes),
      ema9: this.calculateEMA(closes, 9),
      ema21: this.calculateEMA(closes, 21),
      ema50: this.calculateEMA(closes, 50),
      bbPosition: this.calculateBBPosition(closes),
      volumeRatio: this.calculateVolumeRatio(volumes),
      adx: this.calculateADX(candles)
    };
  }
  
  calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }
  
  calculateRSI(prices, period = 14) {
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
  }
  
  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const signal = this.calculateEMA(prices.slice(-9), 9);
    return {
      macdLine: ema12 - ema26,
      signalLine: signal,
      histogram: (ema12 - ema26) - signal
    };
  }
  
  calculateBBPosition(prices) {
    const sma = prices.reduce((a, b) => a + b, 0) / prices.length;
    const std = Math.sqrt(prices.map(p => Math.pow(p - sma, 2)).reduce((a, b) => a + b, 0) / prices.length);
    const upper = sma + 2 * std;
    const lower = sma - 2 * std;
    return (prices[prices.length - 1] - lower) / (upper - lower);
  }
  
  calculateVolumeRatio(volumes) {
    const avg = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    return volumes[volumes.length - 1] / avg;
  }
  
  calculateADX(candles, period = 14) {
    // Simplified ADX
    if (candles.length < period * 2) return 20;
    
    let trend = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = Math.abs(candles[i].close - candles[i - 1].close);
      trend += change;
    }
    
    const avgChange = trend / period;
    const currentPrice = candles[candles.length - 1].close;
    const priceRange = Math.max(...candles.slice(-period).map(c => c.high)) - 
                       Math.min(...candles.slice(-period).map(c => c.low));
    
    if (priceRange === 0) return 20;
    return Math.min(100, (avgChange / priceRange) * 100);
  }
  
  /**
   * Check if we should switch to live trading
   */
  shouldSwitchToLive() {
    const evaluated = this.shadowSignals.filter(s => s.evaluated);
    
    if (evaluated.length < CONFIG.minSignalsBeforeUpdate) {
      return { shouldSwitch: false, reason: 'insufficient_data' };
    }
    
    const correct = evaluated.filter(s => s.wasCorrect).length;
    const accuracy = (correct / evaluated.length) * 100;
    
    // Recent accuracy (last 20 signals)
    const recent = evaluated.slice(-20);
    const recentCorrect = recent.filter(s => s.wasCorrect).length;
    const recentAccuracy = (recentCorrect / recent.length) * 100;
    
    console.log(`\n📊 TRADING DECISION:`);
    console.log(`   Overall Accuracy: ${accuracy.toFixed(1)}%`);
    console.log(`   Recent Accuracy: ${recentAccuracy.toFixed(1)}%`);
    console.log(`   Threshold: ${CONFIG.accuracyThresholdForLive}%`);
    
    if (recentAccuracy >= CONFIG.accuracyThresholdForLive && accuracy >= CONFIG.minAccuracyForUpdate) {
      console.log(`   ✅ SWITCHING TO LIVE TRADING!`);
      return { shouldSwitch: true, accuracy, recentAccuracy };
    }
    
    console.log(`   ❌ Continuing in shadow mode`);
    return { shouldSwitch: false, accuracy, recentAccuracy };
  }
  
  /**
   * Get current learning status
   */
  getStatus() {
    const evaluated = this.shadowSignals.filter(s => s.evaluated);
    const pending = this.shadowSignals.filter(s => !s.evaluated);
    const correct = evaluated.filter(s => s.wasCorrect).length;
    
    const recent = evaluated.slice(-50);
    const recentCorrect = recent.filter(s => s.wasCorrect).length;
    
    return {
      totalSignals: this.shadowSignals.length,
      evaluated: evaluated.length,
      pending: pending.length,
      accuracy: evaluated.length > 0 ? (correct / evaluated.length * 100).toFixed(1) : 0,
      recentAccuracy: recent.length > 0 ? (recentCorrect / recent.length * 100).toFixed(1) : 0,
      brainVersion: this.brain.version || 0,
      lastUpdated: this.brain.lastUpdated,
      shouldLive: this.shouldSwitchToLive().shouldSwitch
    };
  }
}

module.exports = ShadowLearning;
