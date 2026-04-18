// CryptoEdge Value at Risk (VaR) Calculator

class VaRCalculator {
  
  // Historical VaR using returns distribution
  calculateHistoricalVaR(returns, confidence = 0.95) {
    if (returns.length < 20) return 0;
    
    const sorted = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence) * sorted.length);
    return Math.abs(sorted[index]);
  }
  
  // Parametric VaR using normal distribution
  calculateParametricVaR(returns, confidence = 0.95) {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Z-score for 95% = 1.645
    const zScore = 1.645;
    return stdDev * zScore;
  }
  
  // Expected Shortfall (CVaR) - average of losses beyond VaR
  calculateExpectedShortfall(returns, confidence = 0.95) {
    if (returns.length < 20) return 0;
    
    const var95 = this.calculateHistoricalVaR(returns, confidence);
    const tailLosses = returns.filter(r => r <= -var95);
    
    if (tailLosses.length === 0) return var95;
    return Math.abs(tailLosses.reduce((a, b) => a + b, 0) / tailLosses.length);
  }
  
  // Calculate portfolio VaR
  calculatePortfolioVaR(positions, historicalReturns) {
    // Simple VaR: sum of (position * VaR of each asset)
    const var95 = this.calculateHistoricalVaR(historicalReturns);
    
    let totalVaR = 0;
    for (const pos of positions) {
      totalVaR += pos.value * var95;
    }
    
    return {
      var95: (var95 * 100).toFixed(2) + '%',
      expectedShortfall: (this.calculateExpectedShortfall(historicalReturns) * 100).toFixed(2) + '%',
      portfolioVaR: totalVaR.toFixed(2),
      confidence: '95%',
      interpretation: totalVaR > 1000 ? 'HIGH RISK' : totalVaR > 500 ? 'MEDIUM' : 'LOW'
    };
  }
}

module.exports = new VaRCalculator();

if (require.main === module) {
  // Test with mock returns
  const mockReturns = Array.from({length: 100}, () => (Math.random() - 0.5) * 0.1);
  const calc = new VaRCalculator();
  console.log('VaR Test:', calc.calculatePortfolioVaR([{value: 1000}], mockReturns));
}
