// CryptoEdge Stress Testing
// Test system under extreme market conditions

class StressTester {
  constructor() {
    this.scenarios = {};
  }
  
  // Define crash scenarios
  defineScenarios() {
    this.scenarios = {
      '2020_COVID_CRASH': {
        name: 'COVID Flash Crash (Mar 2020)',
        priceChange: -50,
        volatilityMultiplier: 4,
        volumeMultiplier: 3,
        duration: '3 days'
      },
      '2022_CRYPTO_WINTER': {
        name: 'Crypto Winter (2022)',
        priceChange: -75,
        volatilityMultiplier: 3,
        volumeMultiplier: 2,
        duration: '6 months'
      },
      'BLACK_MONDAY': {
        name: 'Black Monday Style Event',
        priceChange: -30,
        volatilityMultiplier: 5,
        volumeMultiplier: 5,
        duration: '1 day'
      },
      'BULL_TRAP': {
        name: 'Bull Trap (fake breakout)',
        priceChange: 20,
        volatilityMultiplier: 2,
        volumeMultiplier: 1.5,
        duration: '2 weeks'
      },
      'VOLATILITY_SPIKE': {
        name: 'Volatility Spike',
        priceChange: -10,
        volatilityMultiplier: 6,
        volumeMultiplier: 2,
        duration: '1 week'
      }
    };
  }
  
  // Run stress test
  runScenario(scenarioName, portfolio) {
    this.defineScenarios();
    const scenario = this.scenarios[scenarioName];
    
    if (!scenario) {
      return { error: 'Unknown scenario' };
    }
    
    const results = {
      scenario: scenarioName,
      name: scenario.name,
      ...this.simulate(portfolio, scenario)
    };
    
    return results;
  }
  
  // Simulate scenario
  simulate(portfolio, scenario) {
    const initial = portfolio.balance;
    const position = portfolio.position || 0;
    
    // Calculate losses
    const priceLoss = scenario.priceChange / 100;
    const positionLoss = position * priceLoss;
    
    // Volatility impact on stop-loss
    const stopLossHit = Math.random() < (scenario.volatilityMultiplier / 10);
    const stopLossPercent = 2 * scenario.volatilityMultiplier;
    const stopLossImpact = stopLossHit ? -(initial * stopLossPercent / 100) : 0;
    
    // Liquidation risk
    const liquidationRisk = scenario.priceChange < -20 ? 'HIGH' : scenario.priceChange < -10 ? 'MEDIUM' : 'LOW';
    
    // Final calculation
    const finalBalance = initial + positionLoss + stopLossImpact;
    const totalLoss = initial - finalBalance;
    const lossPercent = (totalLoss / initial) * 100;
    
    return {
      initialBalance: initial,
      finalBalance: finalBalance.toFixed(2),
      loss: totalLoss.toFixed(2),
      lossPercent: lossPercent.toFixed(1) + '%',
      stopLossHit,
      liquidationRisk,
      survived: finalBalance > initial * 0.5
    };
  }
  
  // Run all scenarios
  runAll(portfolio) {
    this.defineScenarios();
    const results = {};
    
    for (const name of Object.keys(this.scenarios)) {
      results[name] = this.runScenario(name, portfolio);
    }
    
    return results;
  }
  
  // Monte Carlo simulation
  monteCarlo(portfolio, trades = 1000) {
    const results = [];
    
    for (let i = 0; i < trades; i++) {
      const randomReturn = (Math.random() - 0.48) * 0.2; // Slight positive edge
      const balance = portfolio.balance * (1 + randomReturn);
      results.push(balance);
    }
    
    results.sort((a, b) => a - b);
    
    return {
      worst: results[Math.floor(trades * 0.01)].toFixed(2),
      best: results[Math.floor(trades * 0.99)].toFixed(2),
      median: results[Math.floor(trades * 0.5)].toFixed(2),
      percentile5: results[Math.floor(trades * 0.05)].toFixed(2),
      percentile95: results[Math.floor(trades * 0.95)].toFixed(2)
    };
  }
}

module.exports = new StressTester();
