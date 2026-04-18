// CryptoEdge Reflect Agent
// Weekly verbal feedback for strategy improvement

class ReflectAgent {
  constructor() {
    this.feedbackHistory = [];
    this.learnings = [];
  }
  
  // Analyze weekly performance and generate feedback
  analyzeWeeklyPerformance(weeklyStats) {
    const { trades, wins, losses, pnl, bestTrade, worstTrade, regimes } = weeklyStats;
    
    const feedback = {
      timestamp: Date.now(),
      summary: [],
      learnings: [],
      recommendations: []
    };
    
    // Win rate analysis
    const winRate = wins / (trades || 1) * 100;
    if (winRate < 40) {
      feedback.learnings.push("Win rate is low - consider tightening entry criteria");
      feedback.recommendations.push("Wait for stronger signals before entering");
    } else if (winRate > 70) {
      feedback.learnings.push("High win rate - may be too conservative");
      feedback.recommendations.push("Consider taking more trades with lower confidence");
    }
    
    // P&L analysis
    if (pnl < 0) {
      feedback.learnings.push("Week was unprofitable - review losing trades");
      feedback.recommendations.push("Analyze worst trade for pattern");
    }
    
    // Regime analysis
    if (regimes) {
      const bestRegime = Object.entries(regimes).sort((a,b) => b[1] - a[1])[0];
      if (bestRegime) {
        feedback.learnings.push(`Performed best in ${bestRegime[0]} regime`);
      }
    }
    
    // Time analysis
    if (trades > 20) {
      feedback.learnings.push("High trade frequency - check for overtrading");
      feedback.recommendations.push("Consider waiting for higher conviction trades");
    }
    
    this.feedbackHistory.push(feedback);
    this.learnings = feedback.learnings;
    
    return feedback;
  }
  
  // Generate prompt for next week with injected feedback
  generatePrompt(basePrompt) {
    if (this.learnings.length === 0) return basePrompt;
    
    const feedbackSection = `
    
=== PREVIOUS WEEK LEARNINGS ===
${this.learnings.map((l, i) => `${i+1}. ${l}`).join('\n')}

Remember these learnings when making trading decisions this week.
    `.trim();
    
    return basePrompt + feedbackSection;
  }
  
  // Simple reflection on specific trade
  reflectOnTrade(trade) {
    const reflection = {
      timestamp: Date.now(),
      trade,
      whatWorked: [],
      whatFailed: [],
      improvement: ''
    };
    
    if (trade.pnl > 0) {
      reflection.whatWorked.push('Trade was profitable');
      if (trade.confidence > 70) {
        reflection.whatWorked.push('High confidence paid off');
      }
    } else {
      reflection.whatFailed.push('Trade resulted in loss');
      if (trade.holdingTime > 100) {
        reflection.whatFailed.push('Held too long');
      }
    }
    
    return reflection;
  }
  
  getFeedback() {
    return {
      current: this.learnings,
      history: this.feedbackHistory.slice(-4) // last 4 weeks
    };
  }
  
  clearFeedback() {
    this.learnings = [];
  }
}

module.exports = ReflectAgent;
