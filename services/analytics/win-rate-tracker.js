/**
 * Win Rate Tracker v2
 * Properly tracks wins, losses, and calculates accurate statistics
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Load trading journal
 */
function loadJournal() {
  const journalPath = path.join(DATA_DIR, 'trading-journal.json');
  try {
    const data = fs.readFileSync(journalPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

/**
 * Save trading journal
 */
function saveJournal(journal) {
  const journalPath = path.join(DATA_DIR, 'trading-journal.json');
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2));
}

/**
 * Record a completed trade
 */
function recordTrade(trade) {
  const journal = loadJournal();
  
  const completedTrade = {
    id: trade.id || generateId(),
    symbol: trade.symbol,
    side: trade.side,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    pnl: trade.pnl,
    fees: trade.fees || 0,
    entryTime: trade.entryTime,
    exitTime: trade.exitTime || new Date().toISOString(),
    holdingPeriod: trade.holdingPeriod || 0,
    confidence: trade.confidence || 0,
    indicators: trade.indicators || {},
    isWin: trade.pnl > 0,
    isLoss: trade.pnl < 0,
    isBreakeven: trade.pnl === 0,
    exitReason: trade.exitReason || 'unknown'
  };
  
  journal.push(completedTrade);
  saveJournal(journal);
  
  console.log(`📊 Trade recorded: ${completedTrade.side} ${completedTrade.symbol} @ ${completedTrade.exitPrice} → P&L: $${completedTrade.pnl.toFixed(2)} (${completedTrade.isWin ? 'WIN' : 'LOSS'})`);
  
  return completedTrade;
}

/**
 * Get comprehensive statistics
 */
function getStats() {
  const journal = loadJournal();
  
  if (journal.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      totalPnL: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgHoldingPeriod: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      currentStreak: 0,
      largestWin: 0,
      largestLoss: 0
    };
  }
  
  const wins = journal.filter(t => t.isWin);
  const losses = journal.filter(t => t.isLoss);
  const breakeven = journal.filter(t => t.isBreakeven);
  
  const totalWins = wins.reduce((sum, t) => sum + t.pnl, 0);
  const totalLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  
  // Calculate streaks
  let consecutiveWins = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentStreak = 0;
  let lastResult = null;
  
  for (const trade of journal) {
    if (trade.isWin) {
      if (lastResult === 'win') {
        consecutiveWins++;
      } else {
        consecutiveWins = 1;
        consecutiveLosses = 0;
      }
      maxConsecutiveWins = Math.max(maxConsecutiveWins, consecutiveWins);
    } else if (trade.isLoss) {
      if (lastResult === 'loss') {
        consecutiveLosses++;
      } else {
        consecutiveLosses = 1;
        consecutiveWins = 0;
      }
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
    }
    lastResult = trade.isWin ? 'win' : trade.isLoss ? 'loss' : 'breakeven';
  }
  
  // Current streak
  currentStreak = lastResult === 'win' ? consecutiveWins : lastResult === 'loss' ? -consecutiveLosses : 0;
  
  // Avg holding period
  const avgHoldingPeriod = journal.reduce((sum, t) => sum + (t.holdingPeriod || 0), 0) / journal.length;
  
  return {
    totalTrades: journal.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: (wins.length / journal.length * 100).toFixed(1),
    avgWin: wins.length > 0 ? (totalWins / wins.length).toFixed(2) : 0,
    avgLoss: losses.length > 0 ? (totalLosses / losses.length).toFixed(2) : 0,
    profitFactor: totalLosses > 0 ? (totalWins / totalLosses).toFixed(2) : totalWins > 0 ? '∞' : 0,
    totalPnL: (totalWins - totalLosses).toFixed(2),
    bestTrade: Math.max(...journal.map(t => t.pnl)).toFixed(2),
    worstTrade: Math.min(...journal.map(t => t.pnl)).toFixed(2),
    avgHoldingPeriod: avgHoldingPeriod.toFixed(1) + ' hours',
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    currentStreak: currentStreak,
    largestWin: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)).toFixed(2) : 0,
    largestLoss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)).toFixed(2) : 0,
    bySymbol: getStatsBySymbol(journal),
    bySide: getStatsBySide(journal)
  };
}

/**
 * Get stats grouped by symbol
 */
function getStatsBySymbol(journal) {
  const symbols = [...new Set(journal.map(t => t.symbol))];
  const bySymbol = {};
  
  for (const symbol of symbols) {
    const symbolTrades = journal.filter(t => t.symbol === symbol);
    const wins = symbolTrades.filter(t => t.isWin);
    const losses = symbolTrades.filter(t => t.isLoss);
    
    bySymbol[symbol] = {
      trades: symbolTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: (wins.length / symbolTrades.length * 100).toFixed(0) + '%',
      totalPnL: symbolTrades.reduce((sum, t) => sum + t.pnl, 0).toFixed(2)
    };
  }
  
  return bySymbol;
}

/**
 * Get stats grouped by side (LONG/SHORT)
 */
function getStatsBySide(journal) {
  const longs = journal.filter(t => t.side === 'LONG');
  const shorts = journal.filter(t => t.side === 'SHORT');
  
  const calcSide = (trades) => {
    const wins = trades.filter(t => t.isWin);
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    return {
      trades: trades.length,
      wins: wins.length,
      winRate: (wins.length / trades.length * 100).toFixed(0) + '%',
      totalPnL: totalPnL.toFixed(2)
    };
  };
  
  return {
    LONG: calcSide(longs),
    SHORT: calcSide(shorts)
  };
}

/**
 * Update dashboard with correct stats
 */
function updateDashboard() {
  const stats = getStats();
  const dashboardPath = path.join(DATA_DIR, 'dashboard-data.json');
  
  let dashboard = {};
  try {
    dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));
  } catch (e) {}
  
  dashboard.stats = stats;
  dashboard.statsUpdated = new Date().toISOString();
  
  fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2));
  
  return stats;
}

/**
 * Generate unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Print stats summary
 */
function printStats() {
  const stats = getStats();
  
  console.log('\n📊 TRADING JOURNAL STATISTICS');
  console.log('═══════════════════════════════════════');
  console.log(`Total Trades: ${stats.totalTrades}`);
  console.log(`Wins: ${stats.wins} | Losses: ${stats.losses} | Breakeven: ${stats.breakeven}`);
  console.log(`Win Rate: ${stats.winRate}%`);
  console.log(`\nTotal P&L: $${stats.totalPnL}`);
  console.log(`Avg Win: $${stats.avgWin} | Avg Loss: $${stats.avgLoss}`);
  console.log(`Profit Factor: ${stats.profitFactor}`);
  console.log(`\nBest Trade: $${stats.bestTrade} | Worst Trade: $${stats.worstTrade}`);
  console.log(`Largest Win: $${stats.largestWin} | Largest Loss: $${stats.largestLoss}`);
  console.log(`\nConsecutive Wins: ${stats.consecutiveWins} | Consecutive Losses: ${stats.consecutiveLosses}`);
  console.log(`Current Streak: ${stats.currentStreak > 0 ? '+' : ''}${stats.currentStreak}`);
  console.log('═══════════════════════════════════════\n');
  
  return stats;
}

module.exports = {
  recordTrade,
  getStats,
  updateDashboard,
  printStats,
  loadJournal
};
