/**
 * Loss Analyzer — Principle 4
 * Dissects every losing trade to understand WHY it failed
 * Generates actionable adjustments to prevent repeat losses
 */

const { loadBrain, saveBrain } = require('./principles');

class LossAnalyzer {
  
  /**
   * Full post-mortem analysis of a losing trade
   */
  analyze(trade) {
    const pnl = parseFloat(trade.pnl);
    const entryPrice = parseFloat(trade.entry_price);
    const exitPrice = parseFloat(trade.exit_price);
    const direction = trade.side;
    const lossPct = Math.abs(pnl) / (entryPrice * trade.quantity) * 100;

    const analysis = {
      symbol: trade.symbol,
      pnl,
      lossPct: lossPct.toFixed(2) + '%',
      failureType: this.classifyFailure(trade, lossPct),
      rootCause: this.findRootCause(trade, direction, entryPrice, exitPrice),
      marketContext: this.analyzeMarketContext(trade),
      preventionRule: null,
      weightAdjustment: null,
    };

    analysis.preventionRule = this.generatePreventionRule(analysis);
    analysis.weightAdjustment = this.recommendWeightAdjustment(analysis);

    return analysis;
  }

  classifyFailure(trade, lossPct) {
    if (lossPct > 3) return 'CATASTROPHIC'; // Should never happen with 1.5% SL
    if (lossPct > 1.5) return 'STOP_LOSS_HIT';
    if (lossPct > 0.5) return 'SMALL_LOSS_EXPECTED';
    return 'NOISE';
  }

  findRootCause(trade, direction, entry, exit) {
    const causes = [];

    // Wrong direction
    if (direction === 'LONG' && exit < entry) causes.push('WRONG_DIRECTION_BEARISH_MARKET');
    if (direction === 'SHORT' && exit > entry) causes.push('WRONG_DIRECTION_BULLISH_MARKET');

    // Traded against trend
    if (trade.htfTrend && trade.direction !== trade.htfTrend) {
      causes.push('AGAINST_HIGHER_TIMEFRAME_TREND');
    }

    // Low volume signal
    if (trade.volumeRatio && trade.volumeRatio < 0.8) {
      causes.push('LOW_VOLUME_WEAK_SIGNAL');
    }

    // Overconfident signal
    if (trade.confidence && trade.confidence > 80) {
      causes.push('OVERCONFIDENCE_BIAS');
    }

    return causes.length > 0 ? causes : ['MARKET_MOVED_AGAINST_PREDICTION'];
  }

  analyzeMarketContext(trade) {
    return {
      symbol: trade.symbol,
      side: trade.side,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      holdTime: trade.created_at ? 
        ((new Date() - new Date(trade.created_at)) / (1000*60*60)).toFixed(1) + 'h' : 'unknown',
    };
  }

  generatePreventionRule(analysis) {
    switch(analysis.failureType) {
      case 'CATASTROPHIC':
        return 'CRITICAL: Position sizing must be fixed. Never exceed 5% exposure.';
      case 'STOP_LOSS_HIT':
        if (analysis.rootCause.includes('AGAINST_HIGHER_TIMEFRAME_TREND')) {
          return 'Rule: Only trade WITH the 1D trend. Counter-trend trades blacklisted.';
        }
        if (analysis.rootCause.includes('LOW_VOLUME_WEAK_SIGNAL')) {
          return 'Rule: Require volume > 1.2x average before entering.';
        }
        return 'Rule: Wait for stronger confluence before entry.';
      default:
        return 'Rule: Small loss acceptable if risk management followed.';
    }
  }

  recommendWeightAdjustment(analysis) {
    const adjustments = {};
    if (analysis.rootCause.includes('WRONG_DIRECTION_BEARISH_MARKET')) {
      adjustments.ema = -5;  // EMA was misleading
      adjustments.adx = +3;  // Trust trend strength more
    }
    if (analysis.rootCause.includes('LOW_VOLUME_WEAK_SIGNAL')) {
      adjustments.volume = +5; // Volume confirmation more important
    }
    if (analysis.rootCause.includes('OVERCONFIDENCE_BIAS')) {
      adjustments.rsi = -3;
    }
    return adjustments;
  }

  /**
   * Analyze batch of losses and find patterns
   */
  findLossPatterns(lossPatterns) {
    if (lossPatterns.length < 3) return { insufficient: true };

    const bySymbol = {};
    const byDirection = { LONG: 0, SHORT: 0 };
    const bySetup = {};

    for (const loss of lossPatterns) {
      bySymbol[loss.symbol] = (bySymbol[loss.symbol] || 0) + 1;
      byDirection[loss.direction] = (byDirection[loss.direction] || 0) + 1;
      bySetup[loss.setup] = (bySetup[loss.setup] || 0) + 1;
    }

    const worstSymbol = Object.entries(bySymbol).sort((a,b) => b[1]-a[1])[0];
    const worstDirection = byDirection.LONG > byDirection.SHORT ? 'LONG' : 'SHORT';
    const worstSetup = Object.entries(bySetup).sort((a,b) => b[1]-a[1])[0];

    return {
      totalLosses: lossPatterns.length,
      worstSymbol: worstSymbol?.[0],
      worstSymbolLosses: worstSymbol?.[1],
      dominantLossDirection: worstDirection,
      worstSetup: worstSetup?.[0],
      recommendation: this.generatePatternRecommendation(worstSymbol, worstDirection, lossPatterns),
    };
  }

  generatePatternRecommendation(worstSymbol, worstDirection, losses) {
    const recs = [];
    if (worstSymbol && worstSymbol[1] >= 3) {
      recs.push(`Avoid ${worstSymbol[0]} — lost ${worstSymbol[1]} times consecutively`);
    }
    const totalLosses = losses.length;
    const longLosses = losses.filter(l => l.direction === 'LONG').length;
    if (longLosses / totalLosses > 0.7) {
      recs.push('Market is bearish — reduce LONG trades, focus on SHORT setups');
    } else if ((totalLosses - longLosses) / totalLosses > 0.7) {
      recs.push('Market is bullish — reduce SHORT trades, focus on LONG setups');
    }
    return recs;
  }
}

module.exports = new LossAnalyzer();
