/**
 * Monte Carlo Simulation Service
 * Runs 1000+ scenarios to test worst-case outcomes
 */

const fs = require('fs');
const path = require('path');

class MonteCarloSimulator {
  constructor(config = {}) {
    this.numSimulations = config.numSimulations || 10000;
    this.initialBalance = config.initialBalance || 10000;
    this.riskPerTrade = config.riskPerTrade || 0.02;
    this.winRate = config.winRate || 0.55;
    this.avgWin = config.avgWin || 1.5; // R multiple
    this.avgLoss = config.avgLoss || 1.0;
    this.maxTrades = config.maxTrades || 100;
  }

  // Generate random trade outcome
  generateTrade() {
    const isWin = Math.random() < this.winRate;
    return isWin ? this.avgWin : -this.avgLoss;
  }

  // Run single simulation
  runSimulation() {
    let balance = this.initialBalance;
    let peakBalance = this.initialBalance;
    let maxDrawdown = 0;
    let trades = 0;
    let wins = 0;
    let losses = 0;

    for (let i = 0; i < this.maxTrades; i++) {
      const riskAmount = balance * this.riskPerTrade;
      const outcome = this.generateTrade();
      const pnl = riskAmount * outcome;
      
      balance += pnl;
      trades++;
      
      if (outcome > 0) wins++;
      else losses++;

      // Track drawdown
      if (balance > peakBalance) peakBalance = balance;
      const drawdown = (peakBalance - balance) / peakBalance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      // Stop if balance drops below 50%
      if (balance < this.initialBalance * 0.5) break;
    }

    return {
      finalBalance: balance,
      maxDrawdown: maxDrawdown * 100,
      trades,
      wins,
      losses,
      survived: balance > this.initialBalance * 0.5
    };
  }

  // Run all simulations
  async run() {
    console.log(`🎲 Running ${this.numSimulations} Monte Carlo simulations...`);
    
    const results = [];
    const startTime = Date.now();

    for (let i = 0; i < this.numSimulations; i++) {
      results.push(this.runSimulation());
      
      // Progress every 10%
      if (i % (this.numSimulations / 10) === 0) {
        console.log(`  Progress: ${Math.round(i / this.numSimulations * 100)}%`);
      }
    }

    // Analyze results
    const analysis = this.analyzeResults(results);
    
    console.log(`\n⏱️ Completed in ${Date.now() - startTime}ms`);
    
    return analysis;
  }

  analyzeResults(results) {
    const sorted = results.sort((a, b) => a.finalBalance - b.finalBalance);
    const survived = results.filter(r => r.survived).length;
    const drawdowns = results.map(r => r.maxDrawdown);
    
    const percentiles = {
      p10: sorted[Math.floor(this.numSimulations * 0.1)].finalBalance,
      p25: sorted[Math.floor(this.numSimulations * 0.25)].finalBalance,
      p50: sorted[Math.floor(this.numSimulations * 0.5)].finalBalance,
      p75: sorted[Math.floor(this.numSimulations * 0.75)].finalBalance,
      p90: sorted[Math.floor(this.numSimulations * 0.9)].finalBalance,
      p99: sorted[Math.floor(this.numSimulations * 0.99)].finalBalance,
    };

    const maxDrawdownSorted = drawdowns.sort((a, b) => a - b);
    const worstCaseDrawdown = maxDrawdownSorted[Math.floor(drawdowns.length * 0.99)];
    const avgDrawdown = drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length;

    return {
      summary: {
        survivalRate: `${(survived / this.numSimulations * 100).toFixed(1)}%`,
        initialBalance: this.initialBalance,
        finalBalance: {
          p10: percentiles.p10,
          p50: percentiles.p50,
          p90: percentiles.p90,
        },
        drawdown: {
          average: `${avgDrawdown.toFixed(1)}%`,
          worstCase: `${worstCaseDrawdown.toFixed(1)}%`,
          atRisk: `${(100 - survived / this.numSimulations * 100).toFixed(1)}%`,
        },
      },
      verdict: this.getVerdict(survived, worstCaseDrawdown),
      riskAssessment: this.assessRisk(percentiles, worstCaseDrawdown),
    };
  }

  getVerdict(survived, worstDrawdown) {
    const survivalRate = survived / this.numSimulations;
    
    if (survivalRate >= 0.95 && worstDrawdown < 30) return '✅ LOW RISK - Ready for trading';
    if (survivalRate >= 0.90 && worstDrawdown < 40) return '⚠️ MODERATE RISK - Acceptable with monitoring';
    if (survivalRate >= 0.80) return '❌ HIGH RISK - Reduce position size';
    return '🚨 CRITICAL - Do not trade';
  }

  assessRisk(percentiles, worstDrawdown) {
    const lost10 = percentiles.p10 < this.initialBalance * 0.9;
    const lost50 = percentiles.p50 < this.initialBalance * 0.5;
    
    return {
      has10PercentLoss: lost10,
      has50PercentLoss: lost50,
      worstCaseScenario: `Could lose up to ${(100 - worstDrawdown).toFixed(0)}% in worst 1% of cases`,
      recommendation: lost50 
        ? '⚠️ Consider reducing risk per trade'
        : '✅ Risk parameters acceptable',
    };
  }

  // Save results to file
  saveResults(analysis) {
    const outputPath = path.join(__dirname, '../../data/monte-carlo-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📁 Results saved to: ${outputPath}`);
  }
}

// CLI execution
if (require.main === module) {
  const simulator = new MonteCarloSimulator({
    numSimulations: 10000,
    initialBalance: 10000,
    riskPerTrade: 0.02,
    winRate: 0.55,
    avgWin: 1.5,
    avgLoss: 1.0,
    maxTrades: 100,
  });

  simulator.run().then(analysis => {
    console.log('\n📊 MONTE CARLO RESULTS:\n');
    console.log(`Survival Rate: ${analysis.summary.survivalRate}`);
    console.log(`Final Balance (P10): $${analysis.summary.finalBalance.p10.toFixed(0)}`);
    console.log(`Final Balance (P50): $${analysis.summary.finalBalance.p50.toFixed(0)}`);
    console.log(`Final Balance (P90): $${analysis.summary.finalBalance.p90.toFixed(0)}`);
    console.log(`Average Drawdown: ${analysis.summary.drawdown.average}`);
    console.log(`Worst Case Drawdown (1%): ${analysis.summary.drawdown.worstCase}`);
    console.log(`\n${analysis.verdict}`);
    console.log(`\n${analysis.riskAssessment.recommendation}`);
    
    simulator.saveResults(analysis);
  });
}

module.exports = { MonteCarloSimulator };
