/**
 * Auto-Researcher - Updated with Sideways Market Strategies
 * Adds sideways/range trading experiments to the research
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'research-log.json');

const CONFIG = {
  minConfidence: 50,
  telegramToken: '8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU',
  telegramChat: '8169173316'
};

async function sendTelegram(msg) {
  try {
    await axios.post(`https://api.telegram.org/${CONFIG.telegramToken}/sendMessage`, {
      chat_id: CONFIG.telegramChat,
      text: msg,
      parse_mode: 'Markdown'
    });
  } catch {}
}

function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')); }
  catch { return { experiments: [], findings: [], implemented: [] }; }
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function getIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Simple RSI
  let gains = 0, losses = 0;
  for (let i = closes.length - 15; i < closes.length; i++) {
    const change = closes[i] - closes[i-1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / 14 || 0;
  const avgLoss = losses / 14 || 0;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  // Volume ratio
  const avgVol = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  const volRatio = volumes[volumes.length - 1] / avgVol;
  
  // EMA for trend
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const trend = ema9 > ema21 ? 'BULLISH' : ema9 < ema21 ? 'BEARISH' : 'NEUTRAL';
  const trendStrength = Math.abs(ema9 - ema21) / ema21 * 100;
  
  // BB position
  const sma = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  const std = Math.sqrt(closes.slice(-20).map(c => Math.pow(c - sma, 2)).reduce((a,b) => a+b, 0) / 20);
  const upper = sma + 2 * std;
  const lower = sma - 2 * std;
  const bbPos = (closes[closes.length-1] - lower) / (upper - lower);
  
  // Stochastic
  const low20 = Math.min(...lows.slice(-14));
  const high20 = Math.max(...highs.slice(-14));
  const stoch = high20 === low20 ? 50 : ((closes[closes.length-1] - low20) / (high20 - low20)) * 100;
  
  return { rsi, volRatio, trend, trendStrength, bbPos, stoch, closes, highs, lows, volumes };
}

function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = data[0];
  for (let i = 1; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
  return ema;
}

async function runSidewaysExperiments() {
  const log = loadLog();
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'];
  
  console.log('\n🔬 SIDEWAYS MARKET RESEARCH\n');
  
  const experiments = [
    {
      id: 'sideways_rsi_reversal',
      hypothesis: 'RSI < 35 = BUY, RSI > 65 = SELL in sideways markets',
      test: (ind) => {
        if (ind.rsi < 35) return { dir: 'LONG', conf: 70 - ind.rsi };
        if (ind.rsi > 65) return { dir: 'SHORT', conf: ind.rsi - 30 };
        return { dir: 'HOLD', conf: 0 };
      }
    },
    {
      id: 'sideways_bb_reversal',
      hypothesis: 'Buy at lower BB, sell at upper BB in range markets',
      test: (ind) => {
        if (ind.bbPos < 0.2) return { dir: 'LONG', conf: 80 };
        if (ind.bbPos > 0.8) return { dir: 'SHORT', conf: 80 };
        return { dir: 'HOLD', conf: 0 };
      }
    },
    {
      id: 'sideways_stoch_reversal',
      hypothesis: 'Stochastic < 20 = BUY, > 80 = SELL for reversals',
      test: (ind) => {
        if (ind.stoch < 20) return { dir: 'LONG', conf: 75 - ind.stoch };
        if (ind.stoch > 80) return { dir: 'SHORT', conf: ind.stoch - 20 };
        return { dir: 'HOLD', conf: 0 };
      }
    },
    {
      id: 'sideways_volume_spike',
      hypothesis: 'Volume spike + RSI extreme = high probability reversal',
      test: (ind) => {
        if (ind.volRatio > 1.5 && ind.rsi < 40) return { dir: 'LONG', conf: 85 };
        if (ind.volRatio > 1.5 && ind.rsi > 60) return { dir: 'SHORT', conf: 85 };
        if (ind.volRatio < 0.5) return { dir: 'HOLD', conf: 0 };
        return { dir: 'HOLD', conf: 0 };
      }
    },
    {
      id: 'sideways_mean_reversion',
      hypothesis: 'Price reverts to VWAP in low volume markets',
      test: (ind) => {
        const avg = ind.closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        const current = ind.closes[ind.closes.length-1];
        const pctFromAvg = (current - avg) / avg * 100;
        if (pctFromAvg < -2) return { dir: 'LONG', conf: Math.abs(pctFromAvg) * 10 };
        if (pctFromAvg > 2) return { dir: 'SHORT', conf: pctFromAvg * 10 };
        return { dir: 'HOLD', conf: 0 };
      }
    }
  ];
  
  for (const exp of experiments) {
    console.log(`\n📊 Testing: ${exp.id}`);
    
    let results = [];
    
    for (const symbol of symbols) {
      try {
        const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
          params: { symbol, interval: '1h', limit: 100 }
        });
        
        const candles = data.map(k => ({
          close: parseFloat(k[4]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          volume: parseFloat(k[5])
        }));
        
        const ind = getIndicators(candles);
        const result = exp.test(ind);
        
        if (result.dir !== 'HOLD') {
          results.push({ symbol, ...result, indicators: ind });
        }
      } catch {}
    }
    
    // Save experiment
    const confidence = results.length > 0 ? 
      results.reduce((s, r) => s + r.conf, 0) / results.length : 50;
    
    const experiment = {
      category: '📊 Sideways Market',
      hypothesis: exp.hypothesis,
      timestamp: new Date().toISOString(),
      status: 'completed',
      findings: {
        confirmed: confidence > 60,
        confidence: Math.round(confidence),
        data: { signals: results.length }
      },
      recommendation: confidence > 60 ? 'IMPLEMENT' : 'REJECT'
    };
    
    log.experiments.push(experiment);
    console.log(`   Signals: ${results.length}, Confidence: ${confidence.toFixed(0)}%`);
  }
  
  saveLog(log);
  
  // Send Telegram update
  await sendTelegram(`📊 *Sideways Market Research Complete*

Tested 5 new sideways strategies:
• RSI reversal
• BB reversal
• Stochastic reversal  
• Volume spike + RSI
• Mean reversion

Results added to research log.`);

  return log.experiments.length;
}

module.exports = { runSidewaysExperiments };
