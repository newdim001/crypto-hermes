/**
 * Order Flow Analyzer v2
 * Detects large trades (whale activity) and order book imbalances
 */

const axios = require('axios');

const CONFIG = {
  // Whale threshold (% of average volume)
  whaleThreshold: 5, // trades > 5x average volume
  largeTradeThreshold: 2, // trades > 2x average volume
  
  // Time windows
  shortWindow: 5, // minutes
  mediumWindow: 15,
  longWindow: 60,
  
  // Update interval
  updateInterval: 60, // seconds
  
  // Cache
  cache: {
    trades: [],
    orderBook: null,
    whaleActivity: []
  }
};

/**
 * Get recent trades and detect whales
 */
async function getOrderFlow(symbol) {
  try {
    // Fetch recent trades
    const trades = await fetchRecentTrades(symbol);
    
    if (!trades || trades.length === 0) {
      return { hasWhales: false, trades: [], summary: {} };
    }
    
    // Analyze trades
    const analysis = analyzeTrades(trades);
    
    // Update cache
    CONFIG.cache.trades = trades;
    
    return {
      hasWhales: analysis.whales.length > 0,
      whales: analysis.whales,
      totalVolume: analysis.totalVolume,
      buyVolume: analysis.buyVolume,
      sellVolume: analysis.sellVolume,
      buyRatio: analysis.buyRatio,
      largeTrades: analysis.largeTrades,
      trades: trades.slice(0, 20) // Last 20 for display
    };
    
  } catch (err) {
    console.error('Order flow error:', err.message);
    return { hasWhales: false, error: err.message };
  }
}

/**
 * Fetch recent trades from Binance
 */
async function fetchRecentTrades(symbol, limit = 100) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/trades', {
      params: { symbol, limit },
      timeout: 5000
    });
    
    return response.data.map(t => ({
      id: t.id,
      price: parseFloat(t.price),
      quantity: parseFloat(t.qty),
      quoteQty: parseFloat(t.quoteQty),
      time: t.time,
      isBuyerMaker: t.isBuyerMaker,
      isBuy: !t.isBuyerMaker
    }));
    
  } catch (err) {
    throw err;
  }
}

/**
 * Analyze trades for whale activity
 */
function analyzeTrades(trades) {
  // Calculate average trade size
  const totalVolume = trades.reduce((sum, t) => sum + t.quoteQty, 0);
  const avgTradeSize = totalVolume / trades.length;
  
  // Calculate volume thresholds
  const whaleThreshold = avgTradeSize * CONFIG.whaleThreshold;
  const largeThreshold = avgTradeSize * CONFIG.largeTradeThreshold;
  
  // Find whales and large trades
  const whales = [];
  const largeTrades = [];
  let buyVolume = 0;
  let sellVolume = 0;
  
  for (const trade of trades) {
    if (trade.isBuy) {
      buyVolume += trade.quoteQty;
    } else {
      sellVolume += trade.quoteQty;
    }
    
    if (trade.quoteQty >= whaleThreshold) {
      whales.push({
        ...trade,
        multiple: (trade.quoteQty / avgTradeSize).toFixed(1) + 'x',
        side: trade.isBuy ? 'BUY' : 'SELL'
      });
    } else if (trade.quoteQty >= largeThreshold) {
      largeTrades.push({
        ...trade,
        multiple: (trade.quoteQty / avgTradeSize).toFixed(1) + 'x',
        side: trade.isBuy ? 'BUY' : 'SELL'
      });
    }
  }
  
  // Sort by size
  whales.sort((a, b) => b.quoteQty - a.quoteQty);
  largeTrades.sort((a, b) => b.quoteQty - a.quoteQty);
  
  return {
    whales: whales.slice(0, 10), // Top 10 whales
    largeTrades: largeTrades.slice(0, 20), // Top 20 large trades
    totalVolume,
    buyVolume,
    sellVolume,
    buyRatio: buyVolume / totalVolume
  };
}

/**
 * Get order book imbalance
 */
async function getOrderBookImbalance(symbol) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3.depth', {
      params: { symbol, limit: 50 },
      timeout: 5000
    });
    
    const bids = response.data.bids || [];
    const asks = response.data.asks || [];
    
    // Calculate volume on each side
    let bidVolume = 0;
    let askVolume = 0;
    let bidOrders = 0;
    let askOrders = 0;
    
    for (const [price, qty] of bids) {
      bidVolume += parseFloat(price) * parseFloat(qty);
      bidOrders++;
    }
    
    for (const [price, qty] of asks) {
      askVolume += parseFloat(price) * parseFloat(qty);
      askOrders++;
    }
    
    // Calculate imbalance
    const totalVolume = bidVolume + askVolume;
    const imbalance = (bidVolume - askVolume) / totalVolume;
    
    // Strength interpretation
    let strength = 'NEUTRAL';
    let signal = 'HOLD';
    
    if (imbalance > 0.3) {
      strength = 'STRONG_BUY';
      signal = 'LONG';
    } else if (imbalance > 0.1) {
      strength = 'MODERATE_BUY';
      signal = 'LONG';
    } else if (imbalance < -0.3) {
      strength = 'STRONG_SELL';
      signal = 'SHORT';
    } else if (imbalance < -0.1) {
      strength = 'MODERATE_SELL';
      signal = 'SHORT';
    }
    
    CONFIG.cache.orderBook = {
      bidVolume,
      askVolume,
      bidOrders,
      askOrders,
      imbalance,
      strength,
      updated: Date.now()
    };
    
    return {
      bidVolume,
      askVolume,
      bidOrders,
      askOrders,
      imbalance: imbalance.toFixed(3),
      imbalancePercent: (imbalance * 100).toFixed(1) + '%',
      strength,
      signal,
      walls: identifyWalls(bids, asks)
    };
    
  } catch (err) {
    console.error('Order book error:', err.message);
    return { error: err.message };
  }
}

/**
 * Identify large order walls
 */
function identifyWalls(bids, asks) {
  const walls = { buy: [], sell: [] };
  
  // Find big walls in bids (buy walls)
  const bidTotal = bids.reduce((s, [, qty]) => s + parseFloat(qty), 0);
  const bidAvg = bidTotal / bids.length;
  
  for (const [price, qty] of bids.slice(0, 10)) {
    if (parseFloat(qty) > bidAvg * 3) {
      walls.buy.push({
        price: parseFloat(price),
        size: parseFloat(qty),
        strength: (parseFloat(qty) / bidAvg).toFixed(1) + 'x avg'
      });
    }
  }
  
  // Find big walls in asks (sell walls)
  const askTotal = asks.reduce((s, [, qty]) => s + parseFloat(qty), 0);
  const askAvg = askTotal / asks.length;
  
  for (const [price, qty] of asks.slice(0, 10)) {
    if (parseFloat(qty) > askAvg * 3) {
      walls.sell.push({
        price: parseFloat(price),
        size: parseFloat(qty),
        strength: (parseFloat(qty) / askAvg).toFixed(1) + 'x avg'
      });
    }
  }
  
  return walls;
}

/**
 * Get whale accumulation/distribution signal
 */
async function getWhaleSignal(symbol) {
  const orderFlow = await getOrderFlow(symbol);
  const orderBook = await getOrderBookImbalance(symbol);
  
  if (orderFlow.error || orderBook.error) {
    return { signal: 'HOLD', confidence: 0, reason: 'Data unavailable' };
  }
  
  let bullishScore = 0;
  let bearishScore = 0;
  let reasons = [];
  
  // Whale buy pressure
  const whaleBuys = orderFlow.whales.filter(w => w.side === 'BUY').length;
  const whaleSells = orderFlow.whales.filter(w => w.side === 'SELL').length;
  
  if (whaleBuys > whaleSells) {
    bullishScore += 20;
    reasons.push(`Whales buying: ${whaleBuys} vs ${whaleSells} sells`);
  } else if (whaleSells > whaleBuys) {
    bearishScore += 20;
    reasons.push(`Whales selling: ${whaleSells} vs ${whaleBuys} buys`);
  }
  
  // Buy/sell volume ratio
  if (orderFlow.buyRatio > 0.6) {
    bullishScore += 25;
    reasons.push(`High buy ratio: ${(orderFlow.buyRatio * 100).toFixed(0)}%`);
  } else if (orderFlow.buyRatio < 0.4) {
    bearishScore += 25;
    reasons.push(`High sell ratio: ${((1 - orderFlow.buyRatio) * 100).toFixed(0)}%`);
  }
  
  // Order book imbalance
  if (orderBook.imbalance > 0.2) {
    bullishScore += 25;
    reasons.push(`Order book bid imbalance: ${orderBook.imbalancePercent}`);
  } else if (orderBook.imbalance < -0.2) {
    bearishScore += 25;
    reasons.push(`Order book ask imbalance: ${Math.abs(orderBook.imbalancePercent)}`);
  }
  
  // Large walls
  if (orderBook.walls.buy.length > orderBook.walls.sell.length) {
    bullishScore += 15;
    reasons.push('More buy walls than sell walls');
  } else if (orderBook.walls.sell.length > orderBook.walls.buy.length) {
    bearishScore += 15;
    reasons.push('More sell walls than buy walls');
  }
  
  // Determine signal
  const totalScore = bullishScore + bearishScore;
  const netScore = bullishScore - bearishScore;
  
  let signal = 'HOLD';
  let confidence = 0;
  
  if (netScore >= 30) {
    signal = 'STRONG_BUY';
    confidence = Math.min(80, netScore);
  } else if (netScore >= 15) {
    signal = 'BUY';
    confidence = Math.min(70, netScore);
  } else if (netScore <= -30) {
    signal = 'STRONG_SELL';
    confidence = Math.min(80, Math.abs(netScore));
  } else if (netScore <= -15) {
    signal = 'SELL';
    confidence = Math.min(70, Math.abs(netScore));
  }
  
  return {
    signal,
    confidence,
    whaleCount: orderFlow.whales.length,
    buyRatio: (orderFlow.buyRatio * 100).toFixed(0) + '%',
    orderBookImbalance: orderBook.imbalancePercent,
    reasons
  };
}

/**
 * Check for sudden volume spikes
 */
async function detectVolumeSpike(symbol) {
  try {
    const trades = await fetchRecentTrades(symbol, 500);
    
    if (trades.length < 100) {
      return { hasSpike: false };
    }
    
    // Split into 5-minute windows
    const now = Date.now();
    const windowSize = 5 * 60 * 1000; // 5 minutes
    
    const windows = [];
    for (let i = 0; i < 5; i++) {
      const windowStart = now - (i + 1) * windowSize;
      const windowEnd = now - i * windowSize;
      
      const windowTrades = trades.filter(t => t.time >= windowStart && t.time < windowEnd);
      const volume = windowTrades.reduce((s, t) => s + t.quoteQty, 0);
      
      windows.push({ start: windowStart, volume });
    }
    
    // Compare recent to average
    const avgVolume = windows.reduce((s, w) => s + w.volume, 0) / windows.length;
    const recentVolume = windows[0].volume;
    const spikeRatio = recentVolume / avgVolume;
    
    return {
      hasSpike: spikeRatio > 2,
      spikeRatio: spikeRatio.toFixed(1) + 'x',
      recentVolume,
      avgVolume,
      direction: windows[0].volume > avgVolume ? 'UP' : 'DOWN'
    };
    
  } catch (err) {
    return { hasSpike: false, error: err.message };
  }
}

module.exports = {
  getOrderFlow,
  getOrderBookImbalance,
  getWhaleSignal,
  detectVolumeSpike
};
