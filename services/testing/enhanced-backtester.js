/**
 * Enhanced Backtester v2 - Tests Technical + Sentiment + Order Flow Strategy
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

const CONFIG = {
  initialCapital: 10000,
  riskPercent: 2,
  maxPositions: 3,
  commission: 0.001,
  slippage: 0.001,
  symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'],
  timeframe: '1h',
  lookbackDays: 90,
  
  // Strategy thresholds (matching signal-generator-v4)
  minConfidence: 55,
  minTechScore: 30,
  
  // Order flow (simplified for backtest - would need real order flow data)
  whaleBonusLong: 10,
  whaleBonusShort: -10,
  
  // Sentiment (simplified - using market direction as proxy)
  bullMarketThreshold: 0.55,
  bearMarketThreshold: 0.45
};

/**
 * Run enhanced backtest
 */
async function runEnhancedBacktest() {
  console.log('🚀 Starting Enhanced Backtest (Technical + Sentiment + Order Flow)...\n');
  
  const results = {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPnL: 0,
    returnPercent: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    bySymbol: {},
    trades: []
  };
  
  for (const symbol of CONFIG.symbols) {
    console.log(`📊 Testing ${symbol}...`);
    
    try {
      const candles = await fetchHistoricalData(symbol);
      
      if (!candles || candles.length < 200) {
        console.log(`   ⚠️ Insufficient data`);
        continue;
      }
      
      const symbolResult = backtestSymbolStrategy(symbol, candles);
      
      results.bySymbol[symbol] = symbolResult;
      results.totalTrades += symbolResult.trades;
      results.wins += symbolResult.wins;
      results.losses += symbolResult.losses;
      results.totalPnL += symbolResult.finalPnL;
      results.trades.push(...symbolResult.tradeList);
      
      console.log(`   ✅ ${symbol}: ${symbolResult.trades} trades, P&L: $${symbolResult.finalPnL.toFixed(2)}, Win Rate: ${symbolResult.winRate}%`);
      
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
  
  // Print comparison
  printResults(results);
  
  // Save
  saveResults(results);
  
  return results;
}

/**
 * Backtest a single symbol with enhanced strategy
 */
function backtestSymbolStrategy(symbol, candles) {
  const { calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands,
          calculateStochastic, calculateATR, calculateADX, calculateCCI,
          calculateWilliamsR, calculateMFI, calculateVolumeSMA } = 
    require('../ml/technical-indicators-v3');
  
  let capital = CONFIG.initialCapital;
  let position = null;
  const tradeList = [];
  const equityCurve = [capital];
  
  // Market regime detection (simplified using recent price trend)
  const marketTrend = detectMarketRegime(candles);
  
  for (let i = 100; i < candles.length - 10; i++) {
    const window = candles.slice(i - 100, i);
    const currentPrice = candles[i].close;
    const currentVolume = candles[i].volume;
    
    // Calculate all indicators
    const rsi = calculateRSI(window);
    const ema9 = calculateEMA(window, 9);
    const ema21 = calculateEMA(window, 21);
    const ema50 = calculateEMA(window, 50);
    const macd = calculateMACD(window);
    const bb = calculateBollingerBands(window);
    const stoch = calculateStochastic(window);
    const atr = calculateATR(window);
    const adx = calculateADX(window);
    const cci = calculateCCI(window);
    const williamsR = calculateWilliamsR(window);
    const mfi = calculateMFI(window);
    const volumeSMA = calculateVolumeSMA(window);
    const volumeRatio = currentVolume / volumeSMA;
    
    // Calculate technical score
    let techScore = 0;
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    // RSI
    if (rsi < 30) { techScore += 25; bullishSignals += 2; }
    else if (rsi > 70) { techScore -= 25; bearishSignals += 2; }
    else if (rsi < 45) { techScore += 10; bullishSignals++; }
    else if (rsi > 55) { techScore -= 10; bearishSignals++; }
    
    // MACD
    if (macd.histogram > 0 && macd.macdLine > 0) { techScore += 20; bullishSignals += 2; }
    else if (macd.histogram < 0 && macd.macdLine < 0) { techScore -= 20; bearishSignals += 2; }
    else if (macd.histogram > 0) { techScore += 10; bullishSignals++; }
    else { techScore -= 10; bearishSignals++; }
    
    // EMA
    if (ema9 > ema21 && ema21 > ema50) { techScore += 25; bullishSignals += 2; }
    else if (ema9 < ema21 && ema21 < ema50) { techScore -= 25; bearishSignals += 2; }
    else if (ema9 > ema21) { techScore += 15; bullishSignals++; }
    else { techScore -= 15; bearishSignals++; }
    
    // BB
    if (bb.position < 0.2) { techScore += 15; bullishSignals++; }
    else if (bb.position > 0.8) { techScore -= 15; bearishSignals++; }
    
    // Stochastic
    if (stoch.k < 20) { techScore += 15; bullishSignals++; }
    else if (stoch.k > 80) { techScore -= 15; bearishSignals++; }
    
    // ADX
    if (adx.trend === 'BULLISH') { techScore += adx.adx / 3; bullishSignals++; }
    else if (adx.trend === 'BEARISH') { techScore -= adx.adx / 3; bearishSignals++; }
    
    // New indicators
    if (cci < -100) { techScore += 15; bullishSignals++; }
    else if (cci > 100) { techScore -= 15; bearishSignals++; }
    
    if (williamsR < -80) { techScore += 15; bullishSignals++; }
    else if (williamsR > -20) { techScore -= 15; bearishSignals++; }
    
    if (mfi < 20) { techScore += 15; bullishSignals++; }
    else if (mfi > 80) { techScore -= 15; bearishSignals++; }
    
    // Volume
    if (volumeRatio > 1.5) {
      if (techScore > 0) techScore += 10;
      else techScore -= 10;
    }
    
    // === SENTIMENT ADJUSTMENT (using market regime) ===
    let sentimentBonus = 0;
    if (marketTrend === 'BULLISH' && techScore > 0) {
      sentimentBonus = 15;
    } else if (marketTrend === 'BEARISH' && techScore < 0) {
      sentimentBonus = -15;
    } else if (marketTrend === 'BULLISH' && techScore < 0) {
      sentimentBonus = -10; // Counter-trend is harder
    } else if (marketTrend === 'BEARISH' && techScore > 0) {
      sentimentBonus = 10; // Counter-trend is harder
    }
    
    const adjustedScore = techScore + sentimentBonus;
    
    // === ORDER FLOW BONUS (simplified - would need real order flow) ===
    // Using volume spikes as proxy for whale activity
    let orderFlowBonus = 0;
    if (volumeRatio > 2) {
      if (techScore > 0) orderFlowBonus = CONFIG.whaleBonusLong;
      else orderFlowBonus = CONFIG.whaleBonusShort;
    }
    
    const finalScore = adjustedScore + orderFlowBonus;
    
    // === GENERATE SIGNAL ===
    let direction = 'HOLD';
    let confidence = 0;
    
    if (finalScore > CONFIG.minTechScore && bullishSignals >= 3) {
      direction = 'LONG';
      confidence = Math.min(90, Math.abs(finalScore) + bullishSignals * 5);
    } else if (finalScore < -CONFIG.minTechScore && bearishSignals >= 3) {
      direction = 'SHORT';
      confidence = Math.min(90, Math.abs(finalScore) + bearishSignals * 5);
    }
    
    // === EXECUTE TRADES ===
    if (!position && direction !== 'HOLD' && confidence >= CONFIG.minConfidence) {
      // Check market alignment
      if (direction === 'LONG' && marketTrend === 'BEARISH' && confidence < 75) continue;
      if (direction === 'SHORT' && marketTrend === 'BULLISH' && confidence < 75) continue;
      
      // Entry price with slippage
      const entryPrice = direction === 'LONG' ? 
        currentPrice * (1 + CONFIG.slippage) : 
        currentPrice * (1 - CONFIG.slippage);
      
      // Stop loss (ATR-based)
      const atrPercent = atr / currentPrice;
      const stopLoss = direction === 'LONG' ?
        entryPrice * (1 - atrPercent * 2) :
        entryPrice * (1 + atrPercent * 2);
      
      // Take profit (2:1 minimum)
      const risk = Math.abs(entryPrice - stopLoss);
      const takeProfit = direction === 'LONG' ?
        entryPrice + risk * 2 :
        entryPrice - risk * 2;
      
      // Position sizing
      const riskAmount = capital * (CONFIG.riskPercent / 100);
      const priceRisk = Math.abs(entryPrice - stopLoss);
      const quantity = riskAmount / priceRisk;
      
      position = {
        symbol,
        side: direction,
        entryPrice,
        quantity,
        stopLoss,
        takeProfit,
        entryTime: candles[i].openTime,
        confidence,
        techScore,
        sentimentBonus,
        orderFlowBonus
      };
      
      tradeList.push({
        type: 'OPEN',
        ...position,
        balance: capital
      });
    }
    
    // === CLOSE POSITION ===
    if (position) {
      let shouldExit = false;
      let exitReason = '';
      
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
      
      // Time-based exit (24 hours max)
      const hoursHolding = (candles[i].openTime - position.entryTime) / (1000 * 60 * 60);
      if (hoursHolding > 24 && !shouldExit) {
        shouldExit = true;
        exitReason = 'TIME_EXIT';
      }
      
      // Market regime change exit
      if (position.side === 'LONG' && marketTrend === 'BEARISH' && hoursHolding > 4) {
        shouldExit = true;
        exitReason = 'REGIME_CHANGE';
      }
      if (position.side === 'SHORT' && marketTrend === 'BULLISH' && hoursHolding > 4) {
        shouldExit = true;
        exitReason = 'REGIME_CHANGE';
      }
      
      if (shouldExit) {
        const exitPrice = exitReason === 'STOP_LOSS' ? position.stopLoss : 
                         exitReason === 'TAKE_PROFIT' ? position.takeProfit : 
                         currentPrice;
        
        const pnl = position.side === 'LONG' ?
          (exitPrice - position.entryPrice) * position.quantity :
          (position.entryPrice - exitPrice) * position.quantity;
        
        const fees = (position.quantity * position.entryPrice * CONFIG.commission) +
                     (position.quantity * exitPrice * CONFIG.commission);
        
        const netPnl = pnl - fees;
        capital += netPnl;
        
        tradeList.push({
          type: 'CLOSE',
          symbol: position.symbol,
          side: position.side,
          entryPrice: position.entryPrice,
          exitPrice,
          quantity: position.quantity,
          pnl: netPnl,
          fees,
          exitReason,
          holdingHours: parseFloat(hoursHolding.toFixed(1)),
          confidence: position.confidence,
          techScore: position.techScore,
          sentimentBonus: position.sentimentBonus,
          balance: capital
        });
        
        position = null;
      }
    }
    
    equityCurve.push(capital);
  }
  
  // Close any open position
  if (position) {
    const exitPrice = candles[candles.length - 1].close;
    const pnl = position.side === 'LONG' ?
      (exitPrice - position.entryPrice) * position.quantity :
      (position.entryPrice - exitPrice) * position.quantity;
    
    tradeList.push({
      type: 'CLOSE',
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnl: pnl - (pnl * CONFIG.commission),
      exitReason: 'END_OF_BACKTEST',
      balance: capital
    });
    
    capital += pnl;
  }
  
  const closedTrades = tradeList.filter(t => t.type === 'CLOSE');
  const wins = closedTrades.filter(t => t.pnl > 0).length;
  const losses = closedTrades.filter(t => t.pnl < 0).length;
  
  return {
    symbol,
    trades: closedTrades.length,
    wins,
    losses,
    winRate: closedTrades.length > 0 ? (wins / closedTrades.length * 100).toFixed(1) : 0,
    finalPnL: capital - CONFIG.initialCapital,
    finalCapital: capital,
    tradeList: closedTrades
  };
}

/**
 * Detect market regime using recent trend
 */
function detectMarketRegime(candles) {
  if (candles.length < 50) return 'NEUTRAL';
  
  const recentPrices = candles.slice(-50).map(c => c.close);
  const ema20 = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  const currentPrice = recentPrices[recentPrices.length - 1];
  
  // Check recent trend
  const recentTrend = (currentPrice - recentPrices[0]) / recentPrices[0];
  
  if (currentPrice > ema20 && recentTrend > 0.02) return 'BULLISH';
  if (currentPrice < ema20 && recentTrend < -0.02) return 'BEARISH';
  return 'NEUTRAL';
}

/**
 * Calculate maximum drawdown
 */
function calculateMaxDrawdown(trades) {
  if (trades.length === 0) return 0;
  
  let peak = CONFIG.initialCapital;
  let maxDrawdown = 0;
  
  const sortedTrades = trades.filter(t => t.type === 'CLOSE').sort((a, b) => 
    new Date(a.exitTime) - new Date(b.exitTime)
  );
  
  for (const trade of sortedTrades) {
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
  const closedTrades = trades.filter(t => t.type === 'CLOSE');
  if (closedTrades.length < 2) return 0;
  
  const returns = [];
  let prevBalance = CONFIG.initialCapital;
  
  for (const trade of closedTrades) {
    returns.push(trade.pnl / prevBalance);
    prevBalance = trade.balance;
  }
  
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  // Annualized
  const sharpe = (avgReturn * Math.sqrt(365)) / (stdDev * Math.sqrt(365));
  return sharpe.toFixed(2);
}

/**
 * Fetch historical data
 */
async function fetchHistoricalData(symbol) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/klines', {
      params: { symbol, interval: CONFIG.timeframe, limit: CONFIG.lookbackDays * 24 },
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
 * Print results
 */
function printResults(results) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 ENHANCED BACKTEST RESULTS (Technical + Sentiment + Order Flow)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Period: ${CONFIG.lookbackDays} days`);
  console.log(`Initial Capital: $${CONFIG.initialCapital.toLocaleString()}`);
  console.log(`Final Capital: $${(CONFIG.initialCapital + results.totalPnL).toLocaleString()}`);
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`Total Trades: ${results.totalTrades}`);
  console.log(`Wins: ${results.wins} | Losses: ${results.losses}`);
  console.log(`Win Rate: ${results.winRate}%`);
  console.log(`\nTotal P&L: $${results.totalPnL.toFixed(2)}`);
  console.log(`Return: ${results.returnPercent}%`);
  console.log(`Max Drawdown: ${results.maxDrawdown}%`);
  console.log(`Sharpe Ratio: ${results.sharpeRatio}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  // By symbol breakdown
  console.log('\n📈 BY SYMBOL:');
  for (const [symbol, data] of Object.entries(results.bySymbol)) {
    console.log(`  ${symbol}: ${data.trades} trades, Win Rate: ${data.winRate}%, P&L: $${data.finalPnL.toFixed(2)}`);
  }
  
  // Trade analysis
  const closedTrades = results.trades.filter(t => t.type === 'CLOSE');
  if (closedTrades.length > 0) {
    const avgWin = closedTrades.filter(t => t.pnl > 0)
      .reduce((s, t) => s + t.pnl, 0) / closedTrades.filter(t => t.pnl > 0).length || 0;
    const avgLoss = Math.abs(closedTrades.filter(t => t.pnl < 0)
      .reduce((s, t) => s + t.pnl, 0) / closedTrades.filter(t => t.pnl < 0).length) || 0;
    
    console.log(`\n📉 TRADE ANALYSIS:`);
    console.log(`  Avg Win: $${avgWin.toFixed(2)}`);
    console.log(`  Avg Loss: $${avgLoss.toFixed(2)}`);
    console.log(`  Profit Factor: ${avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '∞'}`);
    
    // Exit reasons
    const exitReasons = {};
    closedTrades.forEach(t => {
      exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
    });
    console.log(`\n📋 EXIT REASONS:`);
    for (const [reason, count] of Object.entries(exitReasons)) {
      console.log(`  ${reason}: ${count}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

/**
 * Save results
 */
function saveResults(results) {
  const fs = require('fs');
  const path = require('path');
  
  const savePath = path.join(__dirname, '../../data/enhanced-backtest-results.json');
  results.savedAt = new Date().toISOString();
  
  fs.writeFileSync(savePath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to ${savePath}`);
}

// Run
if (require.main === module) {
  runEnhancedBacktest()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Backtest error:', err);
      process.exit(1);
    });
}

module.exports = { runEnhancedBacktest };
