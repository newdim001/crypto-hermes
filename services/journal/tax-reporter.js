// CryptoEdge Tax Reporting
// Trade export for tax purposes

const fs = require('fs');
const path = require('path');

class TaxReporter {
  constructor() {
    this.trades = [];
  }

  // Load trades from journal
  loadTrades(journalPath) {
    try {
      const data = fs.readFileSync(journalPath, 'utf8');
      this.trades = JSON.parse(data);
      return { loaded: this.trades.length };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Calculate gains for tax year
  calculateGains(year) {
    const yearTrades = this.trades.filter(t => {
      const tradeYear = new Date(t.timestamp).getFullYear();
      return tradeYear === year && t.outcome;
    });
    
    let totalGains = 0;
    let totalLosses = 0;
    let shortTermGains = 0;
    let longTermGains = 0;
    
    for (const trade of yearTrades) {
      if (!trade.pnl) continue;
      
      if (trade.pnl > 0) {
        totalGains += trade.pnl;
        // Assume short-term for crypto (< 1 year)
        shortTermGains += trade.pnl;
      } else {
        totalLosses += Math.abs(trade.pnl);
      }
    }
    
    const netGain = totalGains - totalLosses;
    
    return {
      year,
      totalTrades: yearTrades.length,
      totalGains: totalGains.toFixed(2),
      totalLosses: totalLosses.toFixed(2),
      netGain: netGain.toFixed(2),
      shortTermGains: shortTermGains.toFixed(2),
      longTermGains: longTermGains.toFixed(2),
      estimatedTax: (netGain * 0.25).toFixed(2) // Simplified 25% rate
    };
  }

  // Export for tax software (8949 format)
  exportForm8949(year) {
    const yearTrades = this.trades.filter(t => {
      const tradeYear = new Date(t.timestamp).getFullYear();
      return tradeYear === year && t.outcome;
    });
    
    const rows = yearTrades.map(t => ({
      description: `${t.quantity} ${t.symbol}`,
      dateAcquired: new Date(t.timestamp).toLocaleDateString(),
      dateSold: t.closedAt ? new Date(t.closedAt).toLocaleDateString() : '',
      proceeds: (t.quantity * (t.closedPrice || t.price)).toFixed(2),
      costBasis: (t.quantity * t.price).toFixed(2),
      gainLoss: (t.pnl || 0).toFixed(2)
    }));
    
    return {
      year,
      trades: rows,
      summary: this.calculateGains(year)
    };
  }

  // Export to CSV
  exportCSV(year) {
    const headers = [
      'Date', 'Symbol', 'Type', 'Quantity', 'Price', 
      'Cost Basis', 'Proceeds', 'Gain/Loss', 'Holding Period'
    ];
    
    const yearTrades = this.trades.filter(t => {
      const tradeYear = new Date(t.timestamp).getFullYear();
      return tradeYear === year;
    });
    
    const rows = yearTrades.map(t => [
      new Date(t.timestamp).toISOString().split('T')[0],
      t.symbol,
      t.side,
      t.quantity,
      t.price,
      (t.quantity * t.price).toFixed(2),
      (t.quantity * (t.closedPrice || t.price)).toFixed(2),
      (t.pnl || 0).toFixed(2),
      'Short-term'
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  // Save report
  saveReport(year, outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      year,
      gains: this.calculateGains(year),
      form8949: this.exportForm8949(year)
    };
    
    try {
      fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
      return { saved: outputPath };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Get summary by month
  getMonthlyBreakdown(year) {
    const monthly = {};
    
    for (let m = 1; m <= 12; m++) {
      monthly[m] = { trades: 0, gains: 0, losses: 0 };
    }
    
    for (const trade of this.trades) {
      const date = new Date(trade.timestamp);
      if (date.getFullYear() !== year) continue;
      
      const month = date.getMonth() + 1;
      monthly[month].trades++;
      
      if (trade.pnl > 0) monthly[month].gains += trade.pnl;
      else if (trade.pnl < 0) monthly[month].losses += Math.abs(trade.pnl);
    }
    
    return monthly;
  }
}

module.exports = new TaxReporter();
