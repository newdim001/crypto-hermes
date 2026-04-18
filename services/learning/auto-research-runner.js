/**
 * Auto Research Runner - Karpathy-Style Experiment Loop
 * Uses MiniMax M2.7 to autonomously improve trading strategy
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');
const PROGRAM_FILE = path.join(__dirname, '../../program.md');

const CONFIG = {
  experimentDuration: 30 * 60 * 1000, // 30 minutes
  minTradesPerExperiment: 3,
  improvementThreshold: 5, // % improvement needed to keep change
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: 'deepseek-chat'
};

/**
 * Main auto research controller
 */
class AutoResearch {
  constructor() {
    this.experimentCount = this.loadExperimentCount();
    this.bestScore = this.getBaselineScore();
  }
  
  /**
   * Load current experiment count
   */
  loadExperimentCount() {
    try {
      const log = this.loadLog();
      return log.length;
    } catch {
      return 0;
    }
  }
  
  /**
   * Load experiment log
   */
  loadLog() {
    try {
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'experiment-log.json'), 'utf8'));
    } catch {
      return [];
    }
  }
  
  /**
   * Save experiment log
   */
  saveLog(log) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'experiment-log.json'),
      JSON.stringify(log, null, 2)
    );
  }
  
  /**
   * Get baseline score from current performance
   */
  getBaselineScore() {
    const stats = this.getCurrentStats();
    return {
      winRate: stats.winRate,
      totalPnL: stats.totalPnL,
      maxDrawdown: stats.maxDrawdown,
      sharpeRatio: stats.sharpeRatio,
      trades: stats.totalTrades
    };
  }
  
  /**
   * Get current trading statistics
   */
  getCurrentStats() {
    try {
      const journal = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, 'trading-journal.json'), 'utf8')
      );
      
      const closed = journal.filter(t => t.type === 'CLOSE');
      const wins = closed.filter(t => t.pnl > 0);
      
      return {
        totalTrades: closed.length,
        winRate: closed.length > 0 ? (wins.length / closed.length * 100) : 0,
        totalPnL: closed.reduce((s, t) => s + t.pnl, 0),
        maxDrawdown: this.calculateMaxDrawdown(closed),
        sharpeRatio: this.calculateSharpe(closed)
      };
    } catch {
      return { totalTrades: 0, winRate: 0, totalPnL: 0, maxDrawdown: 0, sharpeRatio: 0 };
    }
  }
  
  calculateMaxDrawdown(trades) {
    if (trades.length === 0) return 0;
    let peak = 10000;
    let maxDD = 0;
    let balance = 10000;
    
    for (const trade of trades) {
      balance += trade.pnl;
      if (balance > peak) peak = balance;
      const dd = ((peak - balance) / peak) * 100;
      maxDD = Math.max(maxDD, dd);
    }
    return maxDD;
  }
  
  calculateSharpe(trades) {
    if (trades.length < 2) return 0;
    const returns = trades.map(t => t.pnl / 10000);
    const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
    const std = Math.sqrt(
      returns.map(r => Math.pow(r - avg, 2)).reduce((a, b) => a + b, 0) / returns.length
    );
    return std > 0 ? avg / std * Math.sqrt(252) : 0;
  }
  
  /**
   * Read the program.md
   */
  readProgram() {
    return fs.readFileSync(PROGRAM_FILE, 'utf8');
  }
  
  /**
   * Read current signal generator code
   */
  readSignalGenerator() {
    const files = [
      'services/ml/signal-generator-v3.js',
      'services/ml/learned-signal-generator.js',
      'services/risk/dynamic-position-sizer.js'
    ];
    
    const code = {};
    for (const file of files) {
      try {
        code[file] = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
      } catch {}
    }
    return code;
  }
  
  /**
   * Run one experiment using DeepSeek AI
   */
  async runExperiment() {
    this.experimentCount++;
    const experimentNum = this.experimentCount;
    
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🧪 EXPERIMENT #${experimentNum}`);
    console.log(`${'═'.repeat(50)}`);
    
    // 1. Read current state
    const program = this.readProgram();
    const code = this.readSignalGenerator();
    const baseline = this.getBaselineScore();
    const stats = this.getCurrentStats();
    
    console.log('\n📊 BASELINE:');
    console.log(`   Win Rate: ${baseline.winRate.toFixed(1)}%`);
    console.log(`   P&L: $${baseline.totalPnL.toFixed(2)}`);
    console.log(`   Max DD: ${baseline.maxDrawdown.toFixed(2)}%`);
    
    // 2. Ask DeepSeek to propose improvement
    console.log('\n🤖 Consulting DeepSeek AI...');
    
    const improvement = await this.proposeImprovement(program, code, stats);
    
    if (!improvement.shouldProceed) {
      console.log('\n⏭️ AI recommends waiting - no clear improvement opportunity');
      console.log(`   Reason: ${improvement.reason}`);
      this.experimentCount--; // Don't count this
      return { action: 'skipped', reason: improvement.reason };
    }
    
    console.log(`\n💡 PROPOSED CHANGE:`);
    console.log(`   ${improvement.description}`);
    
    // 3. Apply the change
    console.log('\n🔧 Applying change...');
    const backup = { ...code };
    
    try {
      for (const [file, newCode] of Object.entries(improvement.codeChanges)) {
        fs.writeFileSync(
          path.join(__dirname, '../..', file),
          newCode
        );
      }
    } catch (err) {
      console.log(`   ❌ Failed to apply change: ${err.message}`);
      this.experimentCount--;
      return { action: 'failed', error: err.message };
    }
    
    // 4. Run paper trading
    console.log('\n📈 Running paper trading...');
    console.log(`   Duration: ${CONFIG.experimentDuration / 60000} minutes`);
    console.log(`   Min trades needed: ${CONFIG.minTradesPerExperiment}`);
    
    // Simulate paper trading for demo (in real system, would run actual trading cycle)
    const experimentResult = await this.simulateExperiment(experimentNum);
    
    // 5. Evaluate result
    const newStats = this.getCurrentStats();
    const improvement_pct = ((newStats.winRate - baseline.winRate) / baseline.winRate) * 100;
    
    let result = 'NEUTRAL';
    let reasoning = '';
    
    if (newStats.winRate > baseline.winRate + CONFIG.improvementThreshold) {
      result = 'IMPROVED';
      reasoning = `Win rate improved from ${baseline.winRate.toFixed(1)}% to ${newStats.winRate.toFixed(1)}%`;
    } else if (newStats.winRate < baseline.winRate - CONFIG.improvementThreshold) {
      result = 'REVERTED';
      reasoning = `Win rate dropped from ${baseline.winRate.toFixed(1)}% to ${newStats.winRate.toFixed(1)}%`;
      // Revert changes
      console.log('\n↩️ REVERTING changes...');
      for (const [file, origCode] of Object.entries(backup)) {
        fs.writeFileSync(path.join(__dirname, '../..', file), origCode);
      }
    } else {
      result = 'NEUTRAL';
      reasoning = `Win rate unchanged (${baseline.winRate.toFixed(1)}% → ${newStats.winRate.toFixed(1)}%)`;
    }
    
    // 6. Log experiment
    const experiment = {
      number: experimentNum,
      timestamp: new Date().toISOString(),
      baseline,
      result: newStats,
      improvement: improvement.description,
      result,
      reasoning,
      tradesDuringExperiment: newStats.totalTrades - baseline.totalTrades
    };
    
    const log = this.loadLog();
    log.push(experiment);
    this.saveLog(log);
    
    // 7. Print summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 EXPERIMENT RESULT');
    console.log('═'.repeat(50));
    console.log(`   Result: ${result}`);
    console.log(`   Win Rate: ${baseline.winRate.toFixed(1)}% → ${newStats.winRate.toFixed(1)}%`);
    console.log(`   P&L: $${baseline.totalPnL.toFixed(2)} → $${newStats.totalPnL.toFixed(2)}`);
    console.log(`   Reasoning: ${reasoning}`);
    console.log('═'.repeat(50) + '\n');
    
    return experiment;
  }
  
  /**
   * Propose improvement using DeepSeek AI
   */
  async proposeImprovement(program, code, stats) {
    const prompt = `You are an expert trading system researcher. Analyze the current state and propose ONE specific improvement.

## CURRENT STATE
- Win Rate: ${stats.winRate.toFixed(1)}%
- Total P&L: $${stats.totalPnL.toFixed(2)}
- Total Trades: ${stats.totalTrades}
- Max Drawdown: ${stats.maxDrawdown.toFixed(1)}%

## PROGRAM CONSTRAINTS
${program}

## AVAILABLE CODE FILES
${Object.keys(code).join(', ')}

## YOUR TASK
Based on the shadow learning data:
- Volume indicator is 87% accurate (use heavily!)
- RSI is only 24% accurate (use sparingly!)
- Bollinger Bands only 6% accurate (ignore mostly!)
- MACD/EMA/Trend ~47% accurate

Propose ONE specific code change that could improve performance. Focus on:
1. Better indicator weighting
2. Entry/exit timing improvements
3. Confluence requirements (multiple indicators agreeing)
4. Risk management adjustments

Respond in JSON format:
{
  "shouldProceed": true/false,
  "reason": "why or why not",
  "description": "what change to make",
  "codeChanges": {
    "filename.js": "complete new file content"
  }
}`;

    try {
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: CONFIG.model,
          messages: [{ role: 'user', content: prompt }]
        },
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );
      
      const content = response.data.choices[0]?.message?.content || '{}';
      
      // Try to parse JSON from response
      let jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return { shouldProceed: false, reason: 'Could not parse AI response' };
      
    } catch (err) {
      return { shouldProceed: false, reason: `API Error: ${err.message}` };
    }
  }
  
  /**
   * Simulate experiment (placeholder - would run actual paper trading)
   */
  async simulateExperiment(experimentNum) {
    // In a real system, this would:
    // 1. Start paper trading with new code
    // 2. Wait for min trades or timeout
    // 3. Stop trading
    // 4. Return results
    
    console.log('   Running simulated experiment...');
    
    // Simulate some trades
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    return { simulated: true };
  }
  
  /**
   * Print current status
   */
  printStatus() {
    const log = this.loadLog();
    const stats = this.getCurrentStats();
    const baseline = this.bestScore;
    
    console.log('\n' + '═'.repeat(50));
    console.log('📊 AUTO RESEARCH STATUS');
    console.log('═'.repeat(50));
    console.log(`Experiments Run: ${log.length}`);
    console.log(`Current Win Rate: ${stats.winRate.toFixed(1)}%`);
    console.log(`Current P&L: $${stats.totalPnL.toFixed(2)}`);
    console.log(`Current Max DD: ${stats.maxDrawdown.toFixed(1)}%`);
    
    if (log.length > 0) {
      const improved = log.filter(e => e.result === 'IMPROVED').length;
      const reverted = log.filter(e => e.result === 'REVERTED').length;
      console.log(`\nResults: ${improved} ✅ | ${reverted} ↩️ | ${log.length - improved - reverted} ➡️`);
      
      const recent = log.slice(-5);
      console.log('\nRecent Experiments:');
      recent.forEach(e => {
        console.log(`  #${e.number}: ${e.result} - ${e.tradesDuringExperiment} trades`);
      });
    }
    
    console.log('═'.repeat(50) + '\n');
  }
  
  /**
   * Run overnight experiments
   */
  async runOvernight(numExperiments = 20) {
    console.log(`\n🌙 STARTING OVERNIGHT EXPERIMENTS`);
    console.log(`Target: ${numExperiments} experiments`);
    console.log(`Start time: ${new Date().toISOString()}\n`);
    
    let completed = 0;
    
    for (let i = 0; i < numExperiments; i++) {
      const result = await this.runExperiment();
      completed++;
      
      const progress = ((i + 1) / numExperiments * 100).toFixed(0);
      console.log(`📊 Progress: ${progress}% (${i + 1}/${numExperiments})`);
      
      // Wait between experiments
      if (i < numExperiments - 1) {
        console.log('⏳ Waiting 5 minutes before next experiment...\n');
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      }
    }
    
    console.log(`\n✅ OVERNIGHT EXPERIMENTS COMPLETE`);
    console.log(`Experiments run: ${completed}`);
    this.printStatus();
  }
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const action = args[0] || 'status';
  
  const researcher = new AutoResearch();
  
  switch (action) {
    case 'experiment':
      await researcher.runExperiment();
      break;
      
    case 'status':
      researcher.printStatus();
      break;
      
    case 'overnight':
      const count = parseInt(args[1]) || 20;
      await researcher.runOvernight(count);
      break;
      
    case 'loop':
      console.log('🔄 Starting continuous experiment loop...');
      console.log('Press Ctrl+C to stop\n');
      while (true) {
        await researcher.runExperiment();
        console.log('⏳ Waiting 10 minutes before next experiment...\n');
        await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));
      }
      
    default:
      console.log('Usage:');
      console.log('  node auto-research-runner.js status      - Show current status');
      console.log('  node auto-research-runner.js experiment  - Run one experiment');
      console.log('  node auto-research-runner.js overnight [N] - Run N experiments overnight');
      console.log('  node auto-research-runner.js loop       - Continuous experiments');
  }
}

main().catch(console.error);

module.exports = AutoResearch;
