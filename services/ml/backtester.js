// CryptoEdge Backtesting System
// Tests trading strategies on historical data

const axios = require('axios');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

class Backtester {
  constructor() {
    this.initialCapital = 10000;
    this.commission = 0.001; // 0.1% fee
  }
  
  // Fetch historical data
  async getHistoricalData(symbol, interval = '1h', limit = 1000) {
    const r = await axios.get(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    );
    
    return r.data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }
  
  // Simple RSI strategy
  rsiSignal(prices, period = 14) {
    if (prices.length < period + 1) return 'HOLD';
    
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i].close - prices[i-1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    if (rsi < 30) return 'BUY';   // Oversold
    if (rsi > 70) return 'SELL';  // Overbought
    return 'HOLD';
  }
  
  // MACD strategy
  macdSignal(prices) {
    const ema12 = this.ema(prices.map(p => p.close), 12);
    const ema26 = this.ema(prices.map(p => p.close), 26);
    
    if (!ema12 || !ema26) return 'HOLD';
    const macd = ema12 - ema26;
    
    if (macd > 0) return 'BUY';
    if (macd < 0) return 'SELL';
    return 'HOLD';
  }
  
  ema(data, period) {
    if (data.length < period) return null;
    const k = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }
  
  // Run backtest
  async backtest(symbol, strategy = 'RSI', startDate = null, endDate = null) {
    console.log(`\n🔄 Backtesting ${symbol} with ${strategy} strategy...`);
    
    const data = await this.getHistoricalData(symbol);
    if (startDate) {
      // Filter by date if provided
    }
    
    let capital = this.initialCapital;
    let position = null;
    const trades = [];
    let wins = 0, losses = 0;
    
    for (let i = 50; i < data.length; i++) {
      const slice = data.slice(0, i + 1);
      const prices = slice;
      
      // Generate signal
      let signal = 'HOLD';
      if (strategy === 'RSI') signal = this.rsiSignal(prices);
      else if (strategy === 'MACD') signal = this.macdSignal(prices);
      else if (strategy === 'RSI_MACD') {
        const rsi = this.rsiSignal(prices);
        const macd = this.macdSignal(prices);
        if (rsi === 'BUY' && macd === 'BUY') signal = 'BUY';
        else if (rsi === 'SELL' || macd === 'SELL') signal = 'SELL';
      }
      
      const currentPrice = data[i].close;
      
      // Execute trades with SL/TP
      const SL_PCT = 0.025; // 2.5% stop loss
      const TP_PCT = 0.05;  // 5% take profit
      const RISK_PCT = 0.1; // risk 10% of capital per trade

      if (signal === 'BUY' && !position) {
        const riskAmount = capital * RISK_PCT;
        const quantity = riskAmount / currentPrice;
        position = {
          entryPrice: currentPrice,
          quantity,
          sl: currentPrice * (1 - SL_PCT),
          tp: currentPrice * (1 + TP_PCT),
          entryTime: data[i].time,
          side: 'LONG'
        };
        capital -= quantity * currentPrice * (1 + this.commission);
        trades.push({ type: 'BUY', price: currentPrice, time: data[i].time });
      } else if (position) {
        // Check SL/TP hit
        let exitPrice = null;
        if (currentPrice <= position.sl) exitPrice = position.sl;
        else if (currentPrice >= position.tp) exitPrice = position.tp;
        else if (signal === 'SELL') exitPrice = currentPrice;

        if (exitPrice) {
          const proceeds = position.quantity * exitPrice * (1 - this.commission);
          const pnl = proceeds - (position.quantity * position.entryPrice);
          if (pnl > 0) wins++; else losses++;
          trades.push({ type: 'SELL', price: exitPrice, time: data[i].time, pnl,
            return: (pnl / (position.quantity * position.entryPrice)) * 100 });
          capital += proceeds;
          position = null;
        }
      }
    }
    
    // Close any open position
    if (position) {
      const lastPrice = data[data.length - 1].close;
      const proceeds = position.quantity * lastPrice * (1 - this.commission);
      capital += proceeds;
    }
    
    // Calculate metrics
    const totalReturn = ((capital - this.initialCapital) / this.initialCapital) * 100;
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    
    // Calculate max drawdown
    let peak = this.initialCapital;
    let maxDrawdown = 0;
    // (Simplified - would need equity curve for accurate)
    
    // Calculate Sharpe Ratio (simplified)
    const returns = trades.filter(t => t.pnl).map(t => t.return);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length) || 1;
    const sharpeRatio = avgReturn / stdReturn * Math.sqrt(252); // Annualized
    
    const results = {
      symbol,
      strategy,
      initialCapital: this.initialCapital,
      finalCapital: capital,
      totalReturn,
      totalTrades,
      wins,
      losses,
      winRate,
      sharpeRatio: sharpeRatio.toFixed(2),
      maxDrawdown: '0%', // Simplified
    };
    
    console.log(`\n📊 Backtest Results for ${symbol}:`);
    console.log(`  Total Return: ${totalReturn.toFixed(2)}%`);
    console.log(`  Total Trades: ${totalTrades}`);
    console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
    console.log(`  Sharpe Ratio: ${sharpeRatio.toFixed(2)}`);
    
    return results;
  }
  
  // Run multiple backtests
  async runBacktests(symbols, strategies) {
    const results = [];
    
    for (const symbol of symbols) {
      for (const strategy of strategies) {
        const result = await this.backtest(symbol, strategy);
        results.push(result);
      }
    }
    
    // Find best
    const best = results.reduce((a, b) => a.totalReturn > b.totalReturn ? a : b);
    
    console.log(`\n🏆 Best Strategy: ${best.symbol} with ${best.strategy}`);
    console.log(`   Return: ${best.totalReturn.toFixed(2)}%`);
    console.log(`   Win Rate: ${best.winRate.toFixed(1)}%`);
    
    return { allResults: results, best };
  }
}

module.exports = new Backtester();

// Run if called directly
if (require.main === module) {
  const backtester = new Backtester();
  backtester.runBacktests(['BTCUSDT', 'ETHUSDT'], ['RSI', 'MACD', 'RSI_MACD'])
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}
