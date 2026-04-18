// CryptoEdge Pre-Trade Fee Check
const FeeCalculator = require('./fee-calculator');

class PreTradeFeeCheck {
  constructor() {
    this.calc = FeeCalculator;
  }
  
  // Check if trade is worth it after fees
  analyze(trade) {
    // trade: { type, amount, price, symbol, orderType, leverage, expectedProfitPercent }
    const cost = this.calc.totalCost(trade);
    
    const analysis = {
      symbol: trade.symbol,
      type: trade.type,
      tradeValue: (trade.amount * trade.price).toFixed(2),
      feePercent: cost.asPercent.toFixed(3) + '%',
      feeAmount: cost.total?.toFixed(2) || cost.fee.toFixed(2),
      expectedProfit: trade.expectedProfitPercent + '%',
      netProfit: (trade.expectedProfitPercent - cost.asPercent).toFixed(2) + '%',
      verdict: ''
    };
    
    // Decision
    if (cost.asPercent > trade.expectedProfitPercent) {
      analysis.verdict = 'REJECT - Fees exceed profit';
    } else if (trade.expectedProfitPercent - cost.asPercent < 0.3) {
      analysis.verdict = 'REJECT - Insufficient margin after fees';
    } else {
      analysis.verdict = 'APPROVE - Profitable after fees';
    }
    
    return analysis;
  }
  
  // Batch check multiple trades
  batchAnalyze(trades) {
    return trades.map(t => this.analyze(t));
  }
}

module.exports = new PreTradeFeeCheck();
