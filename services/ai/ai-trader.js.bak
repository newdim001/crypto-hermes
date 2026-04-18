// ============================================
// AI TRADING MODULE - Powered by DeepSeek
// ============================================

const axios = require('axios');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-047742372a414b8db973aa426ff4e370';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

// Get current market data for analysis
async function getMarketData(symbol) {
  const { default: axios } = await import('axios');
  
  // Fetch candles
  const klines = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`);
  
  const candles = klines.data.map(k => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5])
  }));
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  // Calculate key indicators
  const rsi = calculateRSI(candles);
  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const macd = calculateMACD(candles);
  const volume = current.volume;
  const avgVolume = candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  
  return {
    symbol,
    price: current.close,
    change24h: ((current.close - candles[0].close) / candles[0].close) * 100,
    rsi,
    ema9,
    ema21,
    macd: macd.histogram,
    trend: ema9 > ema21 ? 'BULLISH' : 'BEARISH',
    volume,
    volumeRatio: volume / avgVolume,
    high24h: Math.max(...candles.slice(-24).map(c => c.high)),
    low24h: Math.min(...candles.slice(-24).map(c => c.low))
  };
}

function calculateRSI(candles, period = 14) {
  if (candles.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = candles.length - period; i < candles.length; i++) {
    const ch = candles[i].close - candles[i-1].close;
    if (ch > 0) gains += ch; else losses -= ch;
  }
  const rs = losses === 0 ? 100 : (gains/period) / (losses/period);
  return 100 - (100 / (1 + rs));
}

function calculateEMA(candles, period) {
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) ema = candles[i].close * k + ema * (1-k);
  return ema;
}

function calculateMACD(candles) {
  const ema12 = calculateEMA(candles, 12);
  const ema26 = calculateEMA(candles, 26);
  return { histogram: ema12 - ema26 };
}

// DeepSeek AI Analysis
async function analyzeWithAI(symbols) {
  console.log(`\n🤖 AI ANALYSIS: DeepSeek analyzing ${symbols.length} symbols...`);
  
  const marketData = [];
  
  for (const symbol of symbols) {
    try {
      const data = await getMarketData(symbol);
      marketData.push(data);
    } catch (e) {
      console.log(`   ⚠️ Failed to get data for ${symbol}: ${e.message}`);
    }
  }
  
  const prompt = `You are an expert crypto trading analyst. Analyze these cryptocurrencies and provide trading signals.

MARKET DATA:
${marketData.map(m => `
${m.symbol}:
- Price: $${m.price.toLocaleString()}
- 24h Change: ${m.change24h.toFixed(2)}%
- RSI (14): ${m.rsi.toFixed(1)}
- EMA 9: $${m.ema9.toLocaleString()}
- EMA 21: $${m.ema21.toLocaleString()}
- MACD Histogram: ${m.macd.toFixed(2)}
- Trend: ${m.trend}
- Volume Ratio: ${m.volumeRatio.toFixed(2)}x
- 24h High: $${m.high24h.toLocaleString()}
- 24h Low: $${m.low24h.toLocaleString()}
`).join('\n')}

For each symbol, respond in this exact format:
SYMBOL: [symbol]
DIRECTION: [LONG/SHORT/HOLD]
CONFIDENCE: [0-100]
ENTRY: [price or "current"]
STOP_LOSS: [price]
TAKE_PROFIT: [price]
REASON: [2-3 sentence explanation]

Example:
SYMBOL: BTCUSDT
DIRECTION: LONG
CONFIDENCE: 85
ENTRY: current
STOP_LOSS: 78500
TAKE_PROFIT: 82000
REASON: RSI showing oversold at 32, EMA crossover bullish, strong volume confirmation.

Analyze all symbols provided.`;

  try {
    const response = await axios.post(
      `${DEEPSEEK_BASE}/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are an expert crypto trading analyst. Provide clear, actionable trading signals based on technical analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const aiResponse = response.data.choices[0].message.content;
    console.log(`\n📊 AI Response:\n${aiResponse}\n`);
    
    // Parse AI response
    const signals = parseAISignals(aiResponse);
    return signals;
    
  } catch (error) {
    console.log(`   ❌ AI Analysis failed: ${error.message}`);
    if (error.response) {
      console.log(`   API Response: ${JSON.stringify(error.response.data)}`);
    }
    return [];
  }
}

function parseAISignals(aiResponse) {
  const signals = [];
  const sections = aiResponse.split('SYMBOL:');
  
  for (const section of sections) {
    if (!section.trim()) continue;
    
    const lines = section.split('\n');
    const signal = {
      symbol: '',
      direction: 'HOLD',
      confidence: 0,
      entry: 'current',
      stopLoss: null,
      takeProfit: null,
      reason: ''
    };
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      
      if (key === 'symbol') signal.symbol = value.trim();
      if (key === 'DIRECTION') signal.direction = value.trim().toUpperCase();
      if (key === 'CONFIDENCE') signal.confidence = parseInt(value.trim()) || 0;
      if (key === 'STOP_LOSS') signal.stopLoss = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (key === 'TAKE_PROFIT') signal.takeProfit = parseFloat(value.replace(/[^0-9.]/g, ''));
      if (key === 'REASON') signal.reason = value.trim();
    }
    
    if (signal.symbol && signal.direction !== 'HOLD') {
      signals.push(signal);
    }
  }
  
  return signals;
}

// Quick AI opinion (faster, less detailed)
async function getQuickOpinion(symbol, brain) {
  const data = await getMarketData(symbol);
  
  const prompt = `Quick trading decision for ${symbol}:
- Price: $${data.price}
- RSI: ${data.rsi.toFixed(1)} (${data.rsi < 30 ? 'oversold' : data.rsi > 70 ? 'overbought' : 'neutral'})
- Trend: ${data.trend}
- Volume: ${data.volumeRatio.toFixed(2)}x average

Should we trade? Reply with exactly: ACTION: [LONG/SHORT/HOLD] | CONFIDENCE: [0-100] | REASON: [short reason]`;

  try {
    const response = await axios.post(
      `${DEEPSEEK_BASE}/chat/completions`,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 200
      },
      {
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const reply = response.data.choices[0].message.content;
    
    // Parse quick response
    const actionMatch = reply.match(/ACTION:\s*(LONG|SHORT|HOLD)/i);
    const confMatch = reply.match(/CONFIDENCE:\s*(\d+)/i);
    
    return {
      symbol,
      direction: actionMatch ? actionMatch[1].toUpperCase() : 'HOLD',
      confidence: confMatch ? parseInt(confMatch[1]) : 50,
      aiReason: reply,
      price: data.price
    };
    
  } catch (error) {
    console.log(`   ❌ Quick AI opinion failed: ${error.message}`);
    return null;
  }
}

module.exports = { analyzeWithAI, getQuickOpinion, getMarketData };
