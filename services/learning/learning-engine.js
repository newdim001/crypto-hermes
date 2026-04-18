/**
 * Learning & Adaptation Engine
 * Analyzes trades and improves strategy over time
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  minTradesForLearning: 10,      // Need at least 10 trades to analyze
  winRateThreshold: 45,         // Below this = poor performance
  acceptableLossPercent: 5,     // Max acceptable single trade loss
  learningIntervalHours: 24,   // Run analysis daily
  momentumWindow: 5,            // Look at last 5 trades for momentum
  regimeLookback: 50            // Look at last 50 trades for regime
};

// ============================================
// TRADE ANALYSIS
// ============================================

async function analyzeRecentTrades(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_mode', 'paper')
    .eq('status', 'CLOSED')
    .gte('exit_time', since)
    .order('exit_time', { ascending: false });
  
  if (error || !trades) {
    return { error: error?.message, trades: [] };
  }
  
  const total = trades.length;
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = wins > 0 ? trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0;
  const avgLoss = losses > 0 ? Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / losses) : 0;
  
  return {
    total,
    wins,
    losses,
    winRate: total > 0 ? (wins / total * 100).toFixed(1) : 0,
    totalPnL: totalPnL.toFixed(2),
    avgWin: avgWin.toFixed(2),
    avgLoss: avgLoss.toFixed(2),
    trades
  };
}

// ============================================
// MOMENTUM DETECTION
// ============================================

function detectMomentum(trades) {
  if (trades.length < CONFIG.momentumWindow) {
    return { status: 'INSUFFICIENT_DATA', recommendation: 'Keep current strategy' };
  }
  
  const recent = trades.slice(0, CONFIG.momentumWindow);
  const winCount = recent.filter(t => t.pnl > 0).length;
  const winRate = winCount / recent.length * 100;
  
  // Hot streak: > 60% win rate in last 5 trades
  if (winRate >= 60) {
    return {
      status: 'HOT_STREAK',
      winRate: winRate.toFixed(1),
      recommendation: 'Slightly increase position size (confidence high)',
      adjustment: 1.25
    };
  }
  
  // Cold streak: < 40% win rate in last 5 trades
  if (winRate <= 40) {
    return {
      status: 'COLD_STREAK',
      winRate: winRate.toFixed(1),
      recommendation: 'Reduce position size, tighten stops',
      adjustment: 0.5
    };
  }
  
  return {
    status: 'NEUTRAL',
    winRate: winRate.toFixed(1),
    recommendation: 'Continue current strategy',
    adjustment: 1.0
  };
}

// ============================================
// REGIME ANALYSIS
// ============================================

function analyzeMarketRegime(trades) {
  if (trades.length < CONFIG.regimeLookback) {
    return { regime: 'UNKNOWN', recommendation: 'Need more data' };
  }
  
  const recent = trades.slice(0, CONFIG.regimeLookback);
  const totalPnL = recent.reduce((s, t) => s + (t.pnl || 0), 0);
  const winRate = recent.filter(t => t.pnl > 0).length / recent.length * 100;
  
  // Strong profit + high win rate = Bull
  if (totalPnL > 0 && winRate > 55) {
    return {
      regime: 'BULL',
      confidence: Math.min(100, winRate),
      recommendation: 'Favor long positions, wider take profits'
    };
  }
  
  // Consistent losses = Bear
  if (totalPnL < 0 && winRate < 45) {
    return {
      regime: 'BEAR',
      confidence: Math.min(100, 100 - winRate),
      recommendation: 'Reduce trading, favor short positions or stay in cash'
    };
  }
  
  // Mixed results = Ranging
  return {
    regime: 'RANGING',
    confidence: 50,
    recommendation: 'Standard position sizing, strict stop losses'
  };
}

// ============================================
// POST-MORTEM ANALYSIS (For Losing Trades)
// ============================================

async function analyzeLosingTrades() {
  const { data: losses } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_mode', 'paper')
    .eq('status', 'CLOSED')
    .lt('pnl', 0)
    .order('exit_time', { ascending: false })
    .limit(20);
  
  if (!losses || losses.length === 0) {
    return { analysis: 'No losing trades to analyze' };
  }
  
  // Categorize losses
  const stopLosses = losses.filter(t => t.exit_reason === 'STOP_LOSS');
  const maxHoldTime = losses.filter(t => t.exit_reason === 'MAX_HOLD_TIME');
  const other = losses.length - stopLosses.length - maxHoldTime.length;
  
  const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
  
  // Identify patterns
  let patterns = [];
  
  if (stopLosses.length > losses.length * 0.6) {
    patterns.push('Stops too tight - consider widening');
  }
  if (maxHoldTime.length > losses.length * 0.3) {
    patterns.push('Holding too long - reduce max hold time');
  }
  
  // Check for worst performing symbols
  const symbolLosses = {};
  losses.forEach(t => {
    if (!symbolLosses[t.symbol]) symbolLosses[t.symbol] = 0;
    symbolLosses[t.symbol] += Math.abs(t.pnl);
  });
  
  const worstSymbol = Object.entries(symbolLosses)
    .sort((a, b) => b[1] - a[1])[0];
  
  return {
    totalLosses: losses.length,
    avgLoss: avgLoss.toFixed(2),
    byReason: {
      stopLoss: stopLosses.length,
      maxHoldTime: maxHoldTime.length,
      other
    },
    patterns,
    worstSymbol: worstSymbol ? `${worstSymbol[0]}: $${worstSymbol[1].toFixed(2)}` : null,
    recommendation: patterns.length > 0 
      ? patterns.join('. ')
      : 'No clear pattern - random noise'
  };
}

// ============================================
// LEARNING RECOMMENDATIONS
// ============================================

async function generateLearningReport() {
  const analysis = await analyzeRecentTrades(24);
  const momentum = detectMomentum(analysis.trades);
  const regime = analyzeMarketRegime(analysis.trades);
  const postMortem = await analyzeLosingTrades();
  
  const recommendations = [];
  
  // Add momentum recommendation
  if (momentum.adjustment !== 1.0) {
    recommendations.push({
      type: 'MOMENTUM',
      action: `Position size ${momentum.adjustment > 1 ? 'increase' : 'decrease'} by ${Math.abs(momentum.adjustment - 1) * 100}%`,
      reason: momentum.recommendation
    });
  }
  
  // Add regime recommendation
  if (regime.regime !== 'UNKNOWN') {
    recommendations.push({
      type: 'REGIME',
      action: regime.recommendation,
      reason: `Market regime: ${regime.regime} (${regime.confidence}% confidence)`
    });
  }
  
  // Add post-mortem recommendations
  if (postMortem.patterns && postMortem.patterns.length > 0) {
    recommendations.push({
      type: 'OPTIMIZATION',
      action: postMortem.recommendation,
      reason: 'Based on recent losing trades'
    });
  }
  
  // Overall assessment
  const winRate = parseFloat(analysis.winRate);
  let overallStatus = 'HEALTHY';
  
  if (winRate < CONFIG.winRateThreshold) {
    overallStatus = 'NEEDS_ATTENTION';
    recommendations.push({
      type: 'ALERT',
      action: 'Win rate below threshold - review strategy',
      reason: `Current: ${winRate}%, Threshold: ${CONFIG.winRateThreshold}%`
    });
  }
  
  return {
    timestamp: new Date().toISOString(),
    period: '24 hours',
    summary: {
      totalTrades: analysis.total,
      winRate: analysis.winRate,
      totalPnL: analysis.totalPnL,
      status: overallStatus
    },
    momentum,
    regime,
    postMortem,
    recommendations
  };
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  analyzeRecentTrades,
  detectMomentum,
  analyzeMarketRegime,
  analyzeLosingTrades,
  generateLearningReport,
  CONFIG
};

// CLI
if (require.main === module) {
  (async () => {
    console.log('📊 Generating Learning Report...\n');
    const report = await generateLearningReport();
    console.log(JSON.stringify(report, null, 2));
  })();
}
