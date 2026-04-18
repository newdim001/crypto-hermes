// CryptoEdge Trading Journal
// Log every trade with reasoning

const fs = require('fs');
const path = require('path');

class TradingJournal {
  constructor() {
    this.journalPath = path.join(__dirname, '../../data/trading-journal.json');
    this.entries = [];
  }

  // Log trade entry
  logTrade(trade) {
    const entry = {
      id: `trade_${Date.now()}`,
      timestamp: Date.now(),
      date: new Date().toISOString(),
      
      // Trade details
      symbol: trade.symbol,
      side: trade.side,
      type: trade.type,
      quantity: trade.quantity,
      price: trade.price,
      value: trade.quantity * trade.price,
      
      // Decision context
      reason: trade.reason || 'No reason provided',
      signals: trade.signals || [],
      confidence: trade.confidence || 0,
      regime: trade.regime || 'UNKNOWN',
      
      // Agent info
      agentDecisions: trade.agentDecisions || {},
      consensusScore: trade.consensusScore || 0,
      
      // Risk context
      riskScore: trade.riskScore || 0,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      
      // Outcome (filled later)
      outcome: null,
      pnl: null,
      closedAt: null,
      lessonLearned: null
    };
    
    this.entries.push(entry);
    this.save();
    
    return { logged: entry.id };
  }

  // Update trade outcome
  updateOutcome(tradeId, outcome) {
    const entry = this.entries.find(e => e.id === tradeId);
    if (!entry) return { error: 'Trade not found' };
    
    entry.outcome = outcome.result; // WIN/LOSS/BREAKEVEN
    entry.pnl = outcome.pnl;
    entry.pnlPercent = outcome.pnlPercent;
    entry.closedAt = Date.now();
    entry.closedPrice = outcome.closedPrice;
    entry.lessonLearned = outcome.lesson || null;
    
    this.save();
    return { updated: tradeId };
  }

  // Add lesson to trade
  addLesson(tradeId, lesson) {
    const entry = this.entries.find(e => e.id === tradeId);
    if (!entry) return { error: 'Trade not found' };
    
    entry.lessonLearned = lesson;
    this.save();
    return { added: true };
  }

  // Get trade analytics
  getAnalytics() {
    const completed = this.entries.filter(e => e.outcome);
    
    const wins = completed.filter(e => e.outcome === 'WIN').length;
    const losses = completed.filter(e => e.outcome === 'LOSS').length;
    const totalPnL = completed.reduce((sum, e) => sum + (e.pnl || 0), 0);
    
    // Group by reason
    const byReason = {};
    for (const e of completed) {
      const reason = e.reason.substring(0, 50);
      if (!byReason[reason]) byReason[reason] = { count: 0, pnl: 0 };
      byReason[reason].count++;
      byReason[reason].pnl += e.pnl || 0;
    }
    
    return {
      totalTrades: this.entries.length,
      completedTrades: completed.length,
      winRate: completed.length ? ((wins / completed.length) * 100).toFixed(1) + '%' : 'N/A',
      totalPnL: totalPnL.toFixed(2),
      avgPnL: completed.length ? (totalPnL / completed.length).toFixed(2) : 'N/A',
      byReason: Object.entries(byReason)
        .sort((a, b) => b[1].pnl - a[1].pnl)
        .slice(0, 5)
    };
  }

  // Get recent trades
  getRecent(limit = 10) {
    return this.entries.slice(-limit).reverse();
  }

  // Search trades
  search(query) {
    return this.entries.filter(e => 
      e.symbol.includes(query.toUpperCase()) ||
      e.reason.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Save to file
  save() {
    try {
      const dir = path.dirname(this.journalPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.journalPath, JSON.stringify(this.entries, null, 2));
      return { saved: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Load from file
  load() {
    try {
      if (fs.existsSync(this.journalPath)) {
        this.entries = JSON.parse(fs.readFileSync(this.journalPath, 'utf8'));
      }
      return { loaded: this.entries.length };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Export to CSV
  exportCSV() {
    const headers = ['Date', 'Symbol', 'Side', 'Qty', 'Price', 'Reason', 'Outcome', 'PnL'];
    const rows = this.entries.map(e => [
      e.date,
      e.symbol,
      e.side,
      e.quantity,
      e.price,
      `"${e.reason}"`,
      e.outcome || 'OPEN',
      e.pnl || 0
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
}

module.exports = new TradingJournal();
