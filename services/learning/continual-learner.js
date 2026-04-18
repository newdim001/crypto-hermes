// CryptoEdge Continual Learning
// Prevents catastrophic forgetting with regime-based memory replay

const ExperienceReplay = require('./experience-replay');

class ContinualLearner {
  constructor(config = {}) {
    this.replay = new ExperienceReplay(config.capacity || 50000);
    this.regimes = ['TRENDING_BULL', 'TRENDING_BEAR', 'RANGING', 'HIGH_VOLATILITY', 'LOW_VOLATILITY'];
    this.modelWeights = {};
    this.regularization = config.regularization || 0.01;
  }
  
  // Add experience with regime label
  addExperience(state, action, reward, nextState, done, regime) {
    this.replay.push({ state, action, reward, nextState, done, regime });
  }
  
  // Balanced sampling across regimes
  train(agent, epochs = 10, batchSize = 32) {
    console.log(`🧠 Training with continual learning...`);
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      // Sample from each regime
      for (const regime of this.regimes) {
        const experiences = this.replay.sampleByRegime(regime, batchSize / this.regimes.length);
        if (experiences.length > 0) {
          agent.replay(experiences);
        }
      }
    }
    
    console.log(`✅ Training complete. Buffer: ${this.replay.buffer.length} experiences`);
    return this.getStats();
  }
  
  // EWC (Elastic Weight Consolidation) - prevents forgetting
  ewcPenalty(oldWeights, currentWeights) {
    let penalty = 0;
    for (const key of Object.keys(oldWeights)) {
      if (currentWeights[key]) {
        penalty += this.regularization * Math.pow(currentWeights[key] - oldWeights[key], 2);
      }
    }
    return penalty;
  }
  
  // Knowledge distillation - transfer from old model
  distill(oldAgent, newAgent, temperature = 2) {
    console.log(`📚 Distilling knowledge from old model...`);
    // Simplified: average Q-values
    for (const state of Object.keys(oldAgent.qTable)) {
      const oldQ = oldAgent.qTable[state];
      const newQ = newAgent.qTable[state] || [0,0,0,0];
      
      // Blend: 70% new, 30% old
      newAgent.qTable[state] = newQ.map((q, i) => q * 0.7 + oldQ[i] * 0.3);
    }
    console.log(`✅ Knowledge distilled`);
  }
  
  getStats() {
    return {
      replayStats: this.replay.getStats(),
      regimes: this.regimes,
      regularization: this.regularization
    };
  }
}

module.exports = ContinualLearner;
