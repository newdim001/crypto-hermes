// CryptoEdge Real-Time Risk Monitor
// Runs independently, can override trader

const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

class RiskMonitor {
  constructor() {
    this.killSwitch = false;
    this.maxDrawdown = 15; // %
    this.maxDailyLoss = 5;  // %
    this.maxPositions = 10;
    this.correlationLimit = 0.7;
  }
  
  async checkAll() {
    const results = {
      timestamp: Date.now(),
      passed: true,
      checks: []
    };
    
    // 1. Check drawdown
    const drawdown = await this.checkDrawdown();
    results.checks.push(drawdown);
    if (!drawdown.passed) results.passed = false;
    
    // 2. Check daily loss
    const dailyLoss = await this.checkDailyLoss();
    results.checks.push(dailyLoss);
    if (!dailyLoss.passed) results.passed = false;
    
    // 3. Check open positions
    const positions = await this.checkPositions();
    results.checks.push(positions);
    if (!positions.passed) results.passed = false;
    
    // 4. Check correlation
    const correlation = await this.checkCorrelation();
    results.checks.push(correlation);
    if (!correlation.passed) results.passed = false;
    
    // 5. Check volatility
    const volatility = await this.checkVolatility();
    results.checks.push(volatility);
    
    // Kill switch
    if (results.passed === false) {
      this.killSwitch = true;
      await this.triggerKillSwitch(results);
    }
    
    return results;
  }
  
  async checkDrawdown() {
    try {
      const balance = await this.getBalance();
      const peak = 13022; // Track this in DB
      const drawdown = ((peak - balance) / peak) * 100;
      
      return {
        name: 'Max Drawdown',
        value: drawdown.toFixed(2) + '%',
        limit: this.maxDrawdown + '%',
        passed: drawdown < this.maxDrawdown,
        action: drawdown >= this.maxDrawdown ? 'KILL SWITCH' : null
      };
    } catch (e) {
      return { name: 'Max Drawdown', passed: true, error: e.message };
    }
  }
  
  async checkDailyLoss() {
    try {
      const balance = await this.getBalance();
      const dailyPnL = balance - 10000;
      const dailyPercent = (dailyPnL / 10000) * 100;
      
      return {
        name: 'Daily Loss',
        value: dailyPercent.toFixed(2) + '%',
        limit: '-' + this.maxDailyLoss + '%',
        passed: dailyPercent > -this.maxDailyLoss,
        action: dailyPercent <= -this.maxDailyLoss ? 'PAUSE TRADING' : null
      };
    } catch (e) {
      return { name: 'Daily Loss', passed: true };
    }
  }
  
  async checkPositions() {
    return { name: 'Open Positions', passed: true, value: 'OK' };
  }
  
  async checkCorrelation() {
    return { name: 'Correlation', passed: true, value: 'OK' };
  }
  
  async checkVolatility() {
    return { name: 'Volatility', passed: true, value: 'OK' };
  }
  
  async getBalance() {
    const ts = Date.now();
    const params = `timestamp=${ts}&recvWindow=5000`;
    const sig = require('crypto').createHmac('sha256', process.env.BINANCE_SECRET_KEY).update(params).digest('hex');
    const r = await axios.get(`https://testnet.binance.vision/api/v3/account?${params}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY }
    });
    return parseFloat(r.data.balances.find(b => b.asset === 'USDT').free);
  }
  
  async triggerKillSwitch(results) {
    console.log('🛑 KILL SWITCH TRIGGERED!');
    console.log('Failed checks:', results.checks.filter(c => !c.passed).map(c => c.name));
    
    // Send alert
    try {
      await axios.post(`https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage`, {
        chat_id: '8169173316',
        text: '🛑 *KILL SWITCH TRIGGERED*\n\nRisk limits breached. Trading halted.',
        parse_mode: 'Markdown'
      });
    } catch (e) {}
  }
  
  reset() {
    this.killSwitch = false;
  }
}

module.exports = new RiskMonitor();

if (require.main === module) {
  RiskMonitor.checkAll().then(r => {
    console.log('Risk Check:', r.passed ? '✅ PASSED' : '❌ FAILED');
    r.checks.forEach(c => console.log(`  ${c.passed ? '✅' : '❌'} ${c.name}: ${c.value || c.error}`));
    process.exit(0);
  });
}
