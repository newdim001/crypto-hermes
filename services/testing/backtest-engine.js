/**
 * Backtesting Engine
 * Test strategies on historical data
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '../../data/market');

async function loadData(symbol, interval) {
  const filePath = path.join(DATA_DIR, `${symbol}_${interval}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath));
    return data.data;
  }
  return null;
}

class Backtester {
  constructor(config = {}) {
    this.initialBalance = config.initialBalance || 10000;
    this.riskPerTrade = config.riskPerTrade || 0.02;
    this.commission = config.commission || 0.001; // 0.1%
    this.slippage = config.slippage || 0.0005; // 0.05%
  }

  // Simple moving average crossover strategy
  async runSMACrossover(symbol = 'BTCUSDT', interval = '1h') {
    console.log(`\n🔄 Running SMA Crossover Backtest: ${symbol} ${interval}`);
    
    const data = await loadData(symbol, interval);
    if (!data || data.length < 200) {
      console.log('❌ Not enough data. Run historical.js first.');
      return null;
    }

    const fastPeriod = 20;
    const slowPeriod = 50;
    
    let balance = this.initialBalance;
    let position = 0;
    let entryPrice = 0;
    let trades = [];
    let equity = [];
    
    for (let i = slowPeriod; i < data.length; i++) {
      const prices = data.slice(0, i + 1).map(d => d.close);
      
      // Calculate SMAs
      const fastSMA = this.sma(prices, fastPeriod);
      const slowSMA = this.sma(prices, slowPeriod);
      const prevFast = this.sma(prices.slice(0, -1), fastPeriod);
      const prevSlow = this.sma(prices.slice(0, -1), slowPeriod);
      
      const currentEquity = balance + (position * data[i].close);
      equity.push({
        time: data[i].time,
        equity: currentEquity,
      });
      
      // Golden Cross (buy signal)
      if (prevFast <= prevSlow && fastSMA > slowSMA && position === 0) {
        const price = data[i].close * (1 + this.slippage);
        const maxPosition = (balance * 0.1); // 10% max position
        position = maxPosition / price;
        balance -= maxPosition;
        entryPrice = price;
        
        trades.push({
          type: 'BUY',
          price,
          time: data[i].time,
          balance,
        });
      }
      
      // Death Cross (sell signal)
      else if (prevFast >= prevSlow && fastSMA < slowSMA && position > 0) {
        const price = data[i].close * (1 - this.slippage);
        const proceeds = position * price * (1 - this.commission);
        balance += proceeds;
        
        trades.push({
          type: 'SELL',
          price,
          time: data[i].time,
          balance,
          pnl: proceeds - (position * entryPrice),
        });
        
        position = 0;
        entryPrice = 0;
      }
    }
    
    // Close any open position
    if (position > 0) {
      const finalPrice = data[data.length - 1].close;
      balance += position * finalPrice;
    }
    
    return this.calculateResults(trades, balance, equity);
  }

  // RSI Mean Reversion Strategy
  async runRSIStrategy(symbol = 'BTCUSDT', interval = '1h') {
    console.log(`\n🔄 Running RSI Backtest: ${symbol} ${interval}`);
    
    const data = await loadData(symbol, interval);
    if (!data || data.length < 200) {
      console.log('❌ Not enough data');
      return null;
    }
    
    const rsiPeriod = 14;
    const oversold = 30;
    const overbought = 70;
    
    let balance = this.initialBalance;
    let position = 0;
    let entryPrice = 0;
    let trades = [];
    let equity = [];
    
    for (let i = rsiPeriod; i < data.length; i++) {
      const prices = data.slice(0, i + 1).map(d => d.close);
      const rsi = this.rsi(prices, rsiPeriod);
      const currentPrice = data[i].close;
      
      const currentEquity = balance + (position * currentPrice);
      equity.push({ time: data[i].time, equity: currentEquity });
      
      // Buy when oversold
      if (rsi < oversold && position === 0) {
        const price = currentPrice * (1 + this.slippage);
        const maxPosition = balance * 0.1;
        position = maxPosition / price;
        balance -= maxPosition;
        entryPrice = price;
        
        trades.push({ type: 'BUY', price, time: data[i].time });
      }
      
      // Sell when overbought
      else if (rsi > overbought && position > 0) {
        const price = currentPrice * (1 - this.slippage);
        const proceeds = position * price * (1 - this.commission);
        balance += proceeds;
        
        trades.push({
          type: 'SELL',
          price,
          time: data[i].time,
          pnl: proceeds - (position * entryPrice),
        });
        
        position = 0;
        entryPrice = 0;
      }
    }
    
    if (position > 0) {
      balance += position * data[data.length - 1].close;
    }
    
    return this.calculateResults(trades, balance, equity);
  }

  // Bollinger Bands Strategy
  async runBollingerStrategy(symbol = 'BTCUSDT', interval = '1h') {
    console.log(`\n🔄 Running Bollinger Bands Backtest: ${symbol} ${interval}`);
    
    const data = await loadData(symbol, interval);
    if (!data || data.length < 50) return null;
    
    const period = 20;
    const stdDev = 2;
    
    let balance = this.initialBalance;
    let position = 0;
    let entryPrice = 0;
    let trades = [];
    let equity = [];
    
    for (let i = period; i < data.length; i++) {
      const closes = data.slice(0, i + 1).map(d => d.close);
      const bb = this.bollingerBands(closes, period, stdDev);
      
      const currentPrice = data[i].close;
      const currentEquity = balance + (position * currentPrice);
      equity.push({ time: data[i].time, equity: currentEquity });
      
      // Buy at lower band
      if (currentPrice < bb.lower && position === 0) {
        const price = currentPrice * (1 + this.slippage);
        position = (balance * 0.1) / price;
        balance -= position * price;
        entryPrice = price;
        
        trades.push({ type: 'BUY', price, time: data[i].time });
      }
      
      // Sell at middle or upper band
      else if (position > 0 && currentPrice > bb.middle) {
        const price = currentPrice * (1 - this.slippage);
        const proceeds = position * price * (1 - this.commission);
        balance += proceeds;
        
        trades.push({
          type: 'SELL',
          price,
          time: data[i].time,
          pnl: proceeds - (position * entryPrice),
        });
        
        position = 0;
        entryPrice = 0;
      }
    }
    
    if (position > 0) {
      balance += position * data[data.length - 1].close;
    }
    
    return this.calculateResults(trades, balance, equity);
  }

  // Calculate results
  calculateResults(trades, finalBalance, equity) {
    const closedTrades = trades.filter(t => t.type === 'SELL');
    const wins = closedTrades.filter(t => t.pnl > 0);
    const losses = closedTrades.filter(t => t.pnl < 0);
    
    const totalReturn = ((finalBalance - this.initialBalance) / this.initialBalance) * 100;
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    
    const pnlValues = closedTrades.map(t => t.pnl);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 0;
    
    // Max drawdown
    let maxDrawdown = 0;
    let peak = this.initialBalance;
    equity.forEach(e => {
      if (e.equity > peak) peak = e.equity;
      const dd = (peak - e.equity) / peak;
      if (dd > maxDrawdown) maxDrawdown = dd;
    });
    
    return {
      initialBalance: this.initialBalance,
      finalBalance: finalBalance.toFixed(2),
      totalReturn: totalReturn.toFixed(2) + '%',
      totalTrades: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: winRate.toFixed(1) + '%',
      avgWin: avgWin.toFixed(2),
      avgLoss: avgLoss.toFixed(2),
      profitFactor: avgLoss > 0 ? (avgWin * wins.length / (avgLoss * losses.length)).toFixed(2) : 'N/A',
      maxDrawdown: (maxDrawdown * 100).toFixed(2) + '%',
      trades: closedTrades,
    };
  }

  // Technical indicators
  sma(data, period) {
    if (data.length < period) return data[data.length - 1];
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  rsi(data, period = 14) {
    if (data.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const rs = gains / (losses || 1);
    return 100 - (100 / (1 + rs));
  }

  bollingerBands(data, period = 20, stdDev = 2) {
    const sma = this.sma(data, period);
    const slice = data.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    return {
      upper: sma + stdDev * std,
      middle: sma,
      lower: sma - stdDev * std,
    };
  }
}

// CLI
if (require.main === module) {
  const backtester = new Backtester({ initialBalance: 10000 });
  
  const args = process.argv.slice(2);
  const symbol = args[0] || 'BTCUSDT';
  const interval = args[1] || '1h';
  const strategy = args[2] || 'sma';
  
  async function run() {
    let results;
    
    switch (strategy) {
      case 'rsi':
        results = await backtester.runRSIStrategy(symbol, interval);
        break;
      case 'bb':
        results = await backtester.runBollingerStrategy(symbol, interval);
        break;
      default:
        results = await backtester.runSMACrossover(symbol, interval);
    }
    
    if (results) {
      console.log('\n📊 BACKTEST RESULTS:');
      console.log('='.repeat(40));
      console.log(`Initial Balance:   $${results.initialBalance}`);
      console.log(`Final Balance:     $${results.finalBalance}`);
      console.log(`Total Return:      ${results.totalReturn}`);
      console.log(`Total Trades:      ${results.totalTrades}`);
      console.log(`Win Rate:          ${results.winRate}`);
      console.log(`Avg Win:           $${results.avgWin}`);
      console.log(`Avg Loss:          $${results.avgLoss}`);
      console.log(`Profit Factor:     ${results.profitFactor}`);
      console.log(`Max Drawdown:      ${results.maxDrawdown}`);
    }
  }
  
  run();
}

module.exports = { Backtester };
