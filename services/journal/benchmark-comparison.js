// CryptoEdge Benchmark Comparison
// Compare strategy vs Buy & Hold

class BenchmarkComparison {
  constructor() {
    this.strategyReturns = [];
    this.benchmarkPrices = [];
    this.startDate = null;
    this.startBalance = 10000;
    this.startBTCPrice = null;
  }

  // Initialize benchmark
  init(startBalance, btcPrice) {
    this.startDate = Date.now();
    this.startBalance = startBalance;
    this.startBTCPrice = btcPrice;
    this.strategyReturns = [{ timestamp: Date.now(), balance: startBalance }];
    this.benchmarkPrices = [{ timestamp: Date.now(), price: btcPrice }];
    
    return { initialized: true, startBalance, startBTCPrice: btcPrice };
  }

  // Update strategy balance
  updateStrategy(balance) {
    this.strategyReturns.push({ timestamp: Date.now(), balance });
    return this.compare();
  }

  // Update benchmark price
  updateBenchmark(btcPrice) {
    this.benchmarkPrices.push({ timestamp: Date.now(), price: btcPrice });
    return this.compare();
  }

  // Compare performance
  compare() {
    if (!this.startBTCPrice || this.strategyReturns.length === 0) {
      return { error: 'Insufficient data' };
    }
    
    const currentBalance = this.strategyReturns[this.strategyReturns.length - 1].balance;
    const currentBTCPrice = this.benchmarkPrices[this.benchmarkPrices.length - 1]?.price || this.startBTCPrice;
    
    // Strategy return
    const strategyReturn = ((currentBalance - this.startBalance) / this.startBalance) * 100;
    
    // Buy & Hold return (if bought BTC at start)
    const btcHoldings = this.startBalance / this.startBTCPrice;
    const buyHoldValue = btcHoldings * currentBTCPrice;
    const buyHoldReturn = ((buyHoldValue - this.startBalance) / this.startBalance) * 100;
    
    // Alpha (excess return)
    const alpha = strategyReturn - buyHoldReturn;
    
    return {
      strategy: {
        startBalance: this.startBalance.toFixed(2),
        currentBalance: currentBalance.toFixed(2),
        return: strategyReturn.toFixed(2) + '%'
      },
      buyAndHold: {
        startPrice: this.startBTCPrice.toFixed(2),
        currentPrice: currentBTCPrice.toFixed(2),
        return: buyHoldReturn.toFixed(2) + '%'
      },
      comparison: {
        alpha: alpha.toFixed(2) + '%',
        outperforming: alpha > 0,
        verdict: alpha > 5 ? 'SIGNIFICANTLY_BETTER' :
                 alpha > 0 ? 'SLIGHTLY_BETTER' :
                 alpha > -5 ? 'SLIGHTLY_WORSE' : 'SIGNIFICANTLY_WORSE'
      },
      dataPoints: {
        strategy: this.strategyReturns.length,
        benchmark: this.benchmarkPrices.length
      }
    };
  }

  // Get historical comparison
  getHistory() {
    return {
      strategy: this.strategyReturns.slice(-30),
      benchmark: this.benchmarkPrices.slice(-30)
    };
  }

  // Calculate Sharpe-like ratio comparison
  getRiskAdjusted() {
    if (this.strategyReturns.length < 10) return { error: 'Need more data' };
    
    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < this.strategyReturns.length; i++) {
      const prev = this.strategyReturns[i - 1].balance;
      const curr = this.strategyReturns[i].balance;
      returns.push((curr - prev) / prev);
    }
    
    // Mean and std
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length);
    
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;
    
    return {
      meanDailyReturn: (mean * 100).toFixed(4) + '%',
      volatility: (std * 100).toFixed(4) + '%',
      sharpeRatio: sharpe.toFixed(2),
      rating: sharpe > 2 ? 'EXCELLENT' : sharpe > 1 ? 'GOOD' : sharpe > 0 ? 'FAIR' : 'POOR'
    };
  }
}

module.exports = new BenchmarkComparison();
