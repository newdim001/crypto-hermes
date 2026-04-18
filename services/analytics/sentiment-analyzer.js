/**
 * Sentiment Analyzer v2
 * Analyzes news, social media, and market sentiment for trading decisions
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const axios = require('axios');

// Cache for sentiment data
let sentimentCache = {
  btc: { score: 50, updated: null },
  eth: { score: 50, updated: null }
};

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Get overall sentiment for a symbol
 */
async function getSentiment(symbol) {
  const cacheKey = symbol.toLowerCase().replace('usdt', '');
  
  // Check cache
  if (sentimentCache[cacheKey] && 
      Date.now() - sentimentCache[cacheKey].updated < CACHE_TTL) {
    return sentimentCache[cacheKey].score;
  }
  
  // Fetch from multiple sources
  const [newsSentiment, socialSentiment, marketSentiment] = await Promise.all([
    fetchNewsSentiment(symbol),
    fetchSocialSentiment(symbol),
    fetchMarketSentiment(symbol)
  ]);
  
  // Weighted average
  const combinedScore = (
    newsSentiment * 0.3 +
    socialSentiment * 0.3 +
    marketSentiment * 0.4
  );
  
  // Normalize to 0-100
  const score = Math.max(0, Math.min(100, combinedScore));
  
  // Update cache
  sentimentCache[cacheKey] = {
    score,
    updated: Date.now(),
    breakdown: {
      news: newsSentiment,
      social: socialSentiment,
      market: marketSentiment
    }
  };
  
  return score;
}

/**
 * Fetch news sentiment using DeepSeek AI
 */
async function fetchNewsSentiment(symbol) {
  if (!CONFIG.DEEPSEEK_API_KEY) return 50;
  
  try {
    // Simple keyword-based sentiment as fallback
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: `Analyze the sentiment for ${symbol.replace('USDT', '')} cryptocurrency today.
                   Give me a single number from 0-100 where:
                   0 = extremely bearish/negative
                   50 = neutral
                   100 = extremely bullish/positive
                   Reply with ONLY the number and nothing else.`
        }]
      },
      {
        headers: {
          'Authorization': `Bearer ${CONFIG.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    const content = response.data.choices[0]?.message?.content || '50';
    const score = parseInt(content.match(/\d+/)?.[0]) || 50;
    return Math.max(0, Math.min(100, score));
    
  } catch (err) {
    console.log('News sentiment error:', err.message);
    return 50; // Neutral on error
  }
}

/**
 * Fetch social media sentiment (Twitter/Reddit based)
 */
async function fetchSocialSentiment(symbol) {
  try {
    // Check for recent social mentions
    // This is a simplified version - real implementation would use Twitter/Reddit APIs
    const baseSymbol = symbol.replace('USDT', '');
    
    // Keyword-based scoring
    const socialScore = Math.random() * 20 + 40; // 40-60 range for demo
    
    return socialScore;
    
  } catch (err) {
    return 50;
  }
}

/**
 * Fetch market-based sentiment (fear & greed, funding rates, etc.)
 */
async function fetchMarketSentiment(symbol) {
  try {
    // Crypto Fear & Greed Index (if available)
    const fearGreedScore = await fetchFearGreedIndex();
    
    // Funding rate analysis (simplified)
    const fundingScore = await analyzeFundingRates(symbol);
    
    // Order book imbalance
    const orderBookScore = await analyzeOrderBook(symbol);
    
    // Combine
    return (fearGreedScore * 0.4 + fundingScore * 0.3 + orderBookScore * 0.3);
    
  } catch (err) {
    return 50;
  }
}

/**
 * Fetch Fear & Greed Index
 */
async function fetchFearGreedIndex() {
  try {
    // Alternative.me API (free, no auth required)
    const response = await axios.get('https://api.alternative.me/fng/', {
      timeout: 5000
    });
    
    const fngValue = parseInt(response.data.data[0].value);
    // Convert to 0-100 scale (already is)
    return fngValue;
    
  } catch (err) {
    return 50; // Neutral on error
  }
}

/**
 * Analyze funding rates (Binance)
 */
async function analyzeFundingRates(symbol) {
  try {
    // Simplified funding rate check
    // Real implementation would fetch from Binance API
    const response = await axios.get('https://api.binance.com/api/v3/premiumIndex', {
      params: { symbol },
      timeout: 5000
    });
    
    const fundingRate = parseFloat(response.data.lastFundingRate);
    
    // Convert funding rate to sentiment score
    // Negative funding = more bullish (longs paying shorts)
    // Positive funding = more bearish (shorts paying longs)
    if (fundingRate < -0.001) return 70; // Very bullish
    if (fundingRate < 0) return 60; // Somewhat bullish
    if (fundingRate > 0.001) return 30; // Very bearish
    if (fundingRate > 0) return 40; // Somewhat bearish
    return 50;
    
  } catch (err) {
    return 50;
  }
}

/**
 * Analyze order book imbalance
 */
async function analyzeOrderBook(symbol) {
  try {
    const response = await axios.get('https://api.binance.com/api/v3/depth', {
      params: { symbol, limit: 20 },
      timeout: 5000
    });
    
    const bids = response.data.bids || [];
    const asks = response.data.asks || [];
    
    // Calculate volume imbalance
    let bidVolume = 0;
    let askVolume = 0;
    
    for (const [price, qty] of bids) {
      bidVolume += parseFloat(price) * parseFloat(qty);
    }
    for (const [price, qty] of asks) {
      askVolume += parseFloat(price) * parseFloat(qty);
    }
    
    const imbalance = (bidVolume - askVolume) / (bidVolume + askVolume);
    
    // Convert to 0-100 score
    // Negative imbalance = more selling pressure
    // Positive imbalance = more buying pressure
    return 50 + (imbalance * 50);
    
  } catch (err) {
    return 50;
  }
}

/**
 * Get sentiment trend
 */
async function getSentimentTrend(symbol, hours = 24) {
  // This would track sentiment over time
  // Simplified for now
  return {
    direction: 'stable',
    change: 0,
    momentum: 'neutral'
  };
}

/**
 * Adjust signal confidence based on sentiment
 */
async function adjustForSentiment(symbol, baseConfidence, direction) {
  const sentiment = await getSentiment(symbol);
  
  let adjustment = 0;
  let reason = '';
  
  if (direction === 'LONG') {
    if (sentiment > 70) {
      adjustment = 10;
      reason = 'Very bullish sentiment';
    } else if (sentiment > 60) {
      adjustment = 5;
      reason = 'Bullish sentiment';
    } else if (sentiment < 30) {
      adjustment = -10;
      reason = 'Bearish sentiment (contrarian long)';
    } else if (sentiment < 40) {
      adjustment = -5;
      reason = 'Somewhat bearish sentiment';
    }
  } else if (direction === 'SHORT') {
    if (sentiment < 30) {
      adjustment = 10;
      reason = 'Very bearish sentiment';
    } else if (sentiment < 40) {
      adjustment = 5;
      reason = 'Bearish sentiment';
    } else if (sentiment > 70) {
      adjustment = -10;
      reason = 'Bullish sentiment (contrarian short)';
    } else if (sentiment > 60) {
      adjustment = -5;
      reason = 'Somewhat bullish sentiment';
    }
  }
  
  return {
    adjustedConfidence: Math.max(0, Math.min(100, baseConfidence + adjustment)),
    sentiment,
    adjustment,
    reason
  };
}

/**
 * Get market-wide sentiment (用于大盘分析)
 */
async function getMarketSentiment() {
  const btcSentiment = await getSentiment('BTCUSDT');
  const ethSentiment = await getSentiment('ETHUSDT');
  
  const avgSentiment = (btcSentiment + ethSentiment) / 2;
  
  let label = 'NEUTRAL';
  if (avgSentiment > 70) label = 'EXTREME_GREED';
  else if (avgSentiment > 60) label = 'GREED';
  else if (avgSentiment > 40) label = 'NEUTRAL';
  else if (avgSentiment > 30) label = 'FEAR';
  else label = 'EXTREME_FEAR';
  
  return {
    btc: btcSentiment,
    eth: ethSentiment,
    average: avgSentiment,
    label
  };
}

const CONFIG = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
};

module.exports = {
  getSentiment,
  getSentimentTrend,
  adjustForSentiment,
  getMarketSentiment
};
