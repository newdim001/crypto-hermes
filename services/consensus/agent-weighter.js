// CryptoEdge Dynamic Agent Weighting
// Adjusts agent weights based on performance by regime

class AgentWeighter {
  constructor() {
    this.performance = {
      'trader': { 'TRENDING_BULL': 0.7, 'TRENDING_BEAR': 0.5, 'RANGING': 0.4 },
      'ml_engineer': { 'TRENDING_BULL': 0.8, 'TRENDING_BEAR': 0.6, 'RANGING': 0.5 },
      'sentiment': { 'TRENDING_BULL': 0.5, 'TRENDING_BEAR': 0.7, 'RANGING': 0.6 },
      'regime': { 'TRENDING_BULL': 0.9, 'TRENDING_BEAR': 0.9, 'RANGING': 0.8 }
    };
  }
  
  getWeights(regime) {
    const w = this.performance;
    return {
      trader: w.trader[regime] || 0.5,
      ml: w.ml_engineer[regime] || 0.5,
      sentiment: w.sentiment[regime] || 0.5
    };
  }
  
  updatePerformance(agent, regime, success) {
    const current = this.performance[agent]?.[regime] || 0.5;
    const delta = success ? 0.05 : -0.05;
    this.performance[agent][regime] = Math.max(0.1, Math.min(1, current + delta));
    console.log(`📊 Updated ${agent} for ${regime}: ${this.performance[agent][regime]}`);
  }
}
module.exports = new AgentWeighter();
