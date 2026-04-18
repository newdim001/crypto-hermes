// CryptoEdge Explainable AI
// Human-readable decision explanations

class ExplainableAI {
  constructor() {
    this.decisions = [];
  }
  
  // Generate decision trace
  explain(decision) {
    const explanation = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      decision: decision.signal,
      confidence: decision.confidence,
      reasoning: [],
      factors: [],
      counterfactuals: []
    };
    
    // Technical factors
    if (decision.technical) {
      explanation.reasoning.push(`Technical indicators: ${decision.technical.signal}`);
      explanation.factors.push({
        name: 'RSI',
        value: decision.technical.rsi,
        impact: decision.technical.rsi < 30 ? 'POSITIVE' : decision.technical.rsi > 70 ? 'NEGATIVE' : 'NEUTRAL'
      });
    }
    
    // Sentiment factors
    if (decision.sentiment) {
      explanation.reasoning.push(`Market sentiment: ${decision.sentiment.label}`);
      explanation.factors.push({
        name: 'Fear/Greed',
        value: decision.sentiment.score,
        impact: decision.sentiment.score < 30 ? 'POSITIVE' : 'POSITIVE'
      });
    }
    
    // Regime factors
    if (decision.regime) {
      explanation.reasoning.push(`Market regime: ${decision.regime.type}`);
      explanation.factors.push({
        name: 'Regime',
        value: decision.regime.type,
        impact: 'POSITIVE'
      });
    }
    
    // Risk factors
    if (decision.risk) {
      explanation.reasoning.push(`Risk assessment: ${decision.risk.status}`);
    }
    
    // Counterfactuals - what would change the decision?
    explanation.counterfactuals = [
      `If RSI was < 30, would be more confident BUY`,
      `If regime was TRENDING_BULL, would increase position size`,
      `If sentiment was GREED, might reduce position`
    ];
    
    this.decisions.push(explanation);
    return explanation;
  }
  
  // Format for human review
  formatForReview(explanation) {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DECISION #${explanation.id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Decision: ${explanation.decision} (${explanation.confidence}% confidence)

📝 Reasoning:
${explanation.reasoning.map(r => `• ${r}`).join('\n')}

📊 Key Factors:
${explanation.factors.map(f => `• ${f.name}: ${f.value} (${f.impact})`).join('\n')}

🔄 What Would Change:
${explanation.counterfactuals.map(c => `• ${c}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }
  
  // Get decision history
  getHistory(limit = 10) {
    return this.decisions.slice(-limit);
  }
  
  // Analyze pattern of losses
  analyzeLosses() {
    const losses = this.decisions.filter(d => d.outcome === 'LOSS');
    if (losses.length === 0) return { pattern: 'No losses recorded' };
    
    const commonFactors = {};
    for (const loss of losses) {
      for (const factor of loss.factors || []) {
        if (factor.impact === 'NEGATIVE') {
          commonFactors[factor.name] = (commonFactors[factor.name] || 0) + 1;
        }
      }
    }
    
    const pattern = Object.entries(commonFactors)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v} times`);
    
    return { pattern };
  }
}

module.exports = new ExplainableAI();
