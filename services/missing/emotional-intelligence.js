// CryptoEdge Emotional Intelligence
// Market psychology: fear, greed, herd behavior

class EmotionalIntelligence {
  constructor() {
    this.fearGreedHistory = [];
  }
  
  // Analyze market psychology
  async analyzePsychology(marketData) {
    const { prices, volumes, fearGreed } = marketData;
    
    const psychology = {
      fearGreed: fearGreed || 50,
      herdBehavior: this.detectHerdBehavior(volumes),
      sentiment: this.interpretSentiment(fearGreed || 50),
      contrarianSignal: null
    };
    
    // Generate contrarian signals
    if (psychology.fearGreed < 20) {
      psychology.contrarianSignal = 'EXTREME_FEAR - Potential buy opportunity';
    } else if (psychology.fearGreed > 80) {
      psychology.contrarianSignal = 'EXTREME_GREED - Potential sell signal';
    }
    
    this.fearGreedHistory.push({ timestamp: Date.now(), value: psychology.fearGreed });
    if (this.fearGreedHistory.length > 100) this.fearGreedHistory.shift();
    
    return psychology;
  }
  
  detectHerdBehavior(volumes) {
    if (!volumes || volumes.length < 10) return 'UNKNOWN';
    
    const recent = volumes.slice(-5);
    const older = volumes.slice(-10, -5);
    
    const recentAvg = recent.reduce((a,b) => a+b, 0) / recent.length;
    const olderAvg = older.reduce((a,b) => a+b, 0) / older.length;
    
    if (recentAvg > olderAvg * 2) return 'INCREASING_VOLUME';
    if (recentAvg < olderAvg * 0.5) return 'DECREASING_VOLUME';
    return 'STABLE';
  }
  
  interpretSentiment(score) {
    if (score < 25) return 'EXTREME_FEAR';
    if (score < 45) return 'FEAR';
    if (score < 55) return 'NEUTRAL';
    if (score < 75) return 'GREED';
    return 'EXTREME_GREED';
  }
  
  // Get narrative - what story is market telling?
  getNarrative(psychology) {
    const narratives = [];
    
    if (psychology.fearGreed < 30) {
      narratives.push('Market in panic mode');
      narratives.push('Possible capitulation - bottom may be near');
    } else if (psychology.fearGreed > 70) {
      narratives.push('Market euphoria detected');
      narratives.push('Risk of pullback increasing');
    }
    
    if (psychology.herdBehavior === 'INCREASING_VOLUME') {
      narratives.push('Strong conviction - watch for breakout');
    }
    
    return narratives;
  }
}

module.exports = new EmotionalIntelligence();
