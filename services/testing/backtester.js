/**
 * Backtester v2
 * Tests trading strategies on historical data before going live
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const CONFIG = {
  initialCapital: 10000,
  riskPercent: 2,
  maxPositions: 3,
  commission: 0.001, // 0.1% per trade
  slippage: 0.0005, // 0.05% slippage
  symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
  timeframe: '1h',
  lookbackDays: 90
};

/**
 * Run comprehensive backtest
 */
async function runBacktest() {
  console.log('🚀 Starting Backtest...\n');
  
  const results = {
    startDate: null,
    endDate: null,
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnL: 0,
    returnPercent: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    trades: []
  };
  
  for (const symbol of CONFIG.symbols) {
    console.log(`📊 Backtesting ${symbol}...`);
    
    try {
      const symbolResult = await backtestSymbol(symbol);
      
      if (symbolResult) {
        results.trades.push(...symbolResult.trades);
        results.totalTrades += symbolResult.trades.length;
        results.wins += symbolResult.wins;
        results.losses += symbolResult.losses;
        results.totalPnL += symbolResult.finalPnL;
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }
  
  // Calculate overall metrics
  results.winRate = results.totalTrades > 0 ? 
    (results.wins / results.totalTrades * 100).toFixed(1) : 0;
  results.returnPercent = ((results.totalPnL / CONFIG.initialCapital) * 100).toFixed(2);
  results.maxDrawdown = calculateMaxDrawdown(results.trades);
  results.sharpeRatio = calculateSharpeRatio(results.trades);
  
  // Print results
  printBacktestResults(results);
  
  // Save results
  saveBacktestResults(results);
  
  return results;
}

/**
 * Backtest a single symbol
 */
async function backtestSymbol(symbol) {
  // Fetch historical data
  const candles = await fetchHistoricalData(symbol, CONFIG.lookbackDays);
  
  if (!candles || candles.length < 200) {
    console.log(`   ⚠️ Insufficient data`);
    return null;
  }
  
  // Simulate trading
  let capital = CONFIG.initialCapital;
  let position = null;
  const trades = [];
  const balance = [capital]; // For drawdown calculation
  
  // Load technical indicators
  const { calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands, 
          calculateStochastic, calculateATR, calculateADX } = 
    require('../ml/technical-indicators-v3');
  
  // Go through each candle (skip first 200 for warmup)
  for (let i = 200; i < candles.length - 5; i++) {
    const window = candles.slice(i - 200, i);
    const currentPrice = candles[i].close;
    
    // Calculate indicators
    const rsi = calculateRSI(window);
    const ema9 = calculateEMA(window, 9);
    const ema21 = calculateEMA(window, 21);
    const macd = calculateMACD(window);
    const bb = calculateBollingerBands(window);
    const stoch = calculateStochastic(window);
    const atr = calculateATR(window);
    const adx = calculateADX(window);
    
    // Generate signal
    const signal = generateSignal({
      rsi, ema9, ema21, macd, bb, stoch, atr, adx
    }, currentPrice);
    
    // Check for entry
    if (!position && signal.direction !== 'HOLD' && signal.confidence >= 60) {
      const stopLoss = signal.direction === 'LONG' ? 
        currentPrice - (atr * 2) : currentPrice + (atr * 2);
      const takeProfit = signal.direction === 'LONG' ? 
        currentPrice + (atr * 4) : currentPrice - (atr * 4);
      
      // Calculate position size
      const riskAmount = capital * (CONFIG.riskPercent / 100);
      const priceRisk = Math.abs(currentPrice - stopLoss);
      const quantity = riskAmount / priceRisk;
      
      position = {
        symbol,
        side: signal.direction,
        entryPrice: currentPrice * (1 + CONFIG.slippage), // Add slippage
        quantity,
        stopLoss,
        takeProfit,
        entryTime: candles[i].openTime,
        confidence: signal.confidence
      };
      
      trades.push({
        type: 'OPEN',
        ...position,
        balance: capital
      });
    }
    
    // Check for exit
    if (position) {
      let shouldExit = false;
      let exitReason = '';
      
      // Stop loss / take profit check
      if (position.side === 'LONG') {
        if (currentPrice <= position.stopLoss) {
          shouldExit = true;
          exitReason = 'STOP_LOSS';
        } else if (currentPrice >= position.takeProfit) {
          shouldExit = true;
          exitReason = 'TAKE_PROFIT';
        }
      } else {
        if (currentPrice >= position.stopLoss) {
          shouldExit = true;
          exitReason = 'STOP_LOSS';
        } else if (currentPrice <= position.takeProfit) {
          shouldExit = true;
          exitReason = 'TAKE_PROFIT';
        }
      }
      
      // Time-based exit (after 24 hours)
      const hoursHolding = (candles[i].openTime - position.entryTime) / (1000 * 60 * 60);
      if (hoursHolding > 24 && !shouldExit) {
        shouldExit = true;
        exitReason = 'TIME_EXIT';
      }
      
      if (shouldExit) {
        const exitPrice = exitReason === 'STOP_LOSS' ? position.stopLoss : 
                         exitReason === 'TAKE_PROFIT' ? position.takeProfit : currentPrice;
        const pnl = position.side === 'LONG' ?
          (exitPrice - position.entryPrice) * position.quantity :
          (position.entryPrice - exitPrice) * position.quantity;
        
        // Subtract fees
        const fees = (position.quantity * position.entryPrice * CONFIG.commission) +
                     (position.quantity * exitPrice * CONFIG.commission);
        
        const netPnl = pnl - fees;
        capital += netPnl;
        
        trades.push({
          type: 'CLOSE',
          symbol: position.symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice,
          quantity: position.quantity,
          pnl: netPnl,
          fees,
          exitReason,
          holdingHours: hoursHolding.toFixed(1),
          confidence: position.confidence,
          balance: capital
        });
        
        position = null;
      }
    }
    
    balance.push(capital);
  }
  
  // Close any open position at the end
  if (position) {
    const exitPrice = candles[candles.length - 1].close;
    const pnl = position.side === 'LONG' ?
      (exitPrice - position.entryPrice) * position.quantity :
      (position.entryPrice - exitPrice) * position.quantity;
    
    trades.push({
      type: 'CLOSE',
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnl: pnl - (pnl * 0.002),
      exitReason: 'END_OF_DATA',
      balance: capital
    });
  }
  
  console.log(`   ✅ ${symbol}: ${trades.filter(t => t.type === 'CLOSE').length} trades, P&L: $${(capital - CONFIG.initialCapital).toFixed(2)}`);
  
  return {
    symbol,
    trades,
    wins: trades.filter(t => t.type === 'CLOSE' && t.pnl > 0).length,
    losses: trades.filter(t => t.type === 'CLOSE' && t.pnl < 0).length,
    finalPnL: capital - CONFIG.initialCapital,
    finalCapital: capital
  };
}

/**
 * Generate signal from indicators
 */
function generateSignal(indicators, price) {
  let score = 0;
  let reasons = [];
  
  // RSI
  if (indicators.rsi < 30) {
    score += 30;
    reasons.push('RSI oversold');
  } else if (indicators.rsi > 70) {
    score -= 30;
    reasons.push('RSI overbought');
  }
  
  // EMA crossover
  if (indicators.ema9 > indicators.ema21) {
    score += 25;
    reasons.push('EMA bullish');
  } else {
    score -= 25;
    reasons.push('EMA bearish');
  }
  
  // MACD
  if (indicators.macd.histogram > 0) {
    score += 20;
    reasons.push('MACD bullish');
  } else {
    score -= 20;
    reasons.push('MACD bearish');
  }
  
  // ADX trend strength
  if (indicators.adx.adx > 25) {
    score += indicators.adx.adx / 5;
  }
  
  // Determine direction
  let direction = 'HOLD';
  let confidence = 0;
  
  if (score >= 30) {
    direction = 'LONG';
    confidence = Math.min(90, Math.abs(score));
  } else if (score <= -30) {
    direction = 'SHORT';
    confidence = Math.min(90, Math.abs(score));
  }
  
  return { direction, confidence, score, reasons };
}

/**
 * Calculate maximum drawdown
 */
function calculateMaxDrawdown(trades) {
  let peak = CONFIG.initialCapital;
  let maxDrawdown = 0;
  
  for (const trade of trades) {
    if (trade.balance > peak) peak = trade.balance;
    const drawdown = ((peak - trade.balance) / peak) * 100;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
  }
  
  return maxDrawdown.toFixed(2);
}

/**
 * Calculate Sharpe ratio
 */
function calculateSharpeRatio(trades) {
  const returns = [];
  let prevBalance = CONFIG.initialCapital;
  
  for (const trade of trades.filter(t => t.type === 'CLOSE')) {
    returns.push((trade.balance - prevBalance) / prevBalance);
    prevBalance = trade.balance;
  }
  
  if (returns.length < 2) return 0;
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualized Sharpe (assuming hourly data, ~8760 hours/year)
  return ((avgReturn * 8760) / (stdDev * Math.sqrt(8760))).toFixed(2);
}

/**
 * Fetch historical data from Binance
 */
async function fetchHistoricalData(symbol, days) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: {
        symbol,
        interval: CONFIG.timeframe,
        limit: days * 24
      },
      timeout: 30000
    });
    
    return response.data.map(c => ({
      openTime: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      closeTime: c[6]
    }));
  } catch (err) {
    throw err;
  }
}

/**
 * Print backtest results
 */
function printBacktestResults(results) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 BACKTEST RESULTS');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Period: ${CONFIG.lookbackDays} days`);
  console.log(`Initial Capital: $${CONFIG.initialCapital.toLocaleString()}`);
  console.log(`Final Capital: $${(CONFIG.initialCapital + results.totalPnL).toLocaleString()}`);
  console.log(`\nTotal Trades: ${results.totalTrades}`);
  console.log(`Wins: ${results.wins} | Losses: ${results.losses}`);
  console.log(`Win Rate: ${results.winRate}%`);
  console.log(`\nTotal P&L: $${results.totalPnL.toFixed(2)}`);
  console.log(`Return: ${results.returnPercent}%`);
  console.log(`Max Drawdown: ${results.maxDrawdown}%`);
  console.log(`Sharpe Ratio: ${results.sharpeRatio}`);
  console.log('═══════════════════════════════════════════════════\n');
}

/**
 * Save backtest results
 */
function saveBacktestResults(results) {
  const fs = require('fs');
  const path = require('path');
  
  const savePath = path.join(__dirname, '../../data/backtest-results.json');
  
  results.savedAt = new Date().toISOString();
  results.config = CONFIG;
  
  fs.writeFileSync(savePath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to ${savePath}`);
}

// CLI mode
if (require.main === module) {
  runBacktest()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Backtest error:', err);
      process.exit(1);
    });
}

module.exports = { runBacktest };
