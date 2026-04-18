/**
 * ML Feature Engineering Pipeline
 * Week 1: Data understanding and feature creation
 */

const axios = require('axios');

// Feature categories as per the trading essentials guide
const FEATURE_CATEGORIES = {
  // Price Action Features
  price_action: [
    'returns_5m', 'returns_15m', 'returns_1h', 'returns_4h', 'returns_1d',
    'log_returns', 'price_position', 'gaps',
  ],
  
  // Volume Analysis
  volume_analysis: [
    'volume_profile', 'vwap', 'volume_momentum', 'buy_sell_imbalance', 'whale_trades',
  ],
  
  // Technical Indicators  
  technical: [
    'ma_20', 'ma_50', 'ma_200', 'rsi', 'macd', 'macd_signal',
    'bollinger_upper', 'bollinger_lower', 'bollinger_width',
    'atr', 'obv', 'mfi',
  ],
  
  // Market Microstructure
  microstructure: [
    'bid_ask_spread', 'order_book_imbalance', 'depth_concentration',
    'trade_size_distribution', 'cancel_replace_ratio',
  ],
  
  // Cross Asset
  cross_asset: [
    'btc_correlation', 'eth_correlation', 'usd_index', 'nasdaq_correlation',
  ],
  
  // Temporal
  temporal: [
    'hour_of_day', 'day_of_week', 'minutes_to_news', 'trading_session',
    'minutes_to_funding',
  ],
  
  // Crypto-specific
  crypto_specific: [
    'funding_rate', 'open_interest', 'dominance', 'halving_cycle_position',
  ],
};

class FeatureEngine {
  constructor() {
    this.features = {};
    this.history = {};
  }

  // Fetch raw market data
  async fetchMarketData(symbol = 'BTCUSDT', intervals = ['1m', '15m', '1h', '4h', '1d']) {
    const data = {};
    
    for (const interval of intervals) {
      try {
        const response = await axios.get(
          `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`
        );
        data[interval] = this.parseKlines(response.data);
      } catch (err) {
        console.error(`Failed to fetch ${interval}:`, err.message);
      }
    }
    
    return data;
  }

  // Parse Binance klines to OHLCV
  parseKlines(klines) {
    return klines.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  }

  // Calculate all features for a symbol
  async calculateFeatures(symbol = 'BTCUSDT') {
    const marketData = await this.fetchMarketData(symbol);
    const features = {};
    
    // Price action features
    features.price_action = this.calculatePriceAction(marketData['1h']);
    features.volume_analysis = this.calculateVolumeFeatures(marketData['1h']);
    features.technical = this.calculateTechnicalIndicators(marketData['1h']);
    features.crypto_specific = await this.calculateCryptoFeatures(symbol);
    features.temporal = this.calculateTemporalFeatures();
    
    this.features[symbol] = features;
    return features;
  }

  // Price action features
  calculatePriceAction(data) {
    if (!data || data.length < 50) return {};
    
    const closes = data.map(d => d.close);
    const returns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    
    return {
      returns_5m: returns[returns.length - 5] || 0,
      returns_15m: returns[returns.length - 15] || 0,
      returns_1h: returns[returns.length - 1] || 0,
      returns_1d: this.calculatePeriodReturn(closes, 24),
      log_returns: Math.log(closes[closes.length - 1] / closes[0]),
      price_position: (closes[closes.length - 1] - Math.min(...closes.slice(-24))) / 
                      (Math.max(...closes.slice(-24)) - Math.min(...closes.slice(-24)) || 1),
    };
  }

  // Volume features
  calculateVolumeFeatures(data) {
    if (!data || data.length < 20) return {};
    
    const volumes = data.map(d => d.volume);
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];
    
    return {
      vwap: this.calculateVWAP(data),
      volume_momentum: currentVolume / avgVolume,
      buy_sell_imbalance: Math.random() * 2 - 1, // Would need order book data
      whale_trades: 0, // Would need trade-level data
    };
  }

  // Technical indicators
  calculateTechnicalIndicators(data) {
    if (!data || data.length < 200) return {};
    
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);
    
    return {
      ma_20: this.sma(closes, 20),
      ma_50: this.sma(closes, 50),
      ma_200: this.sma(closes, 200),
      rsi: this.rsi(closes, 14),
      macd: this.macd(closes),
      bollinger_upper: this.bollingerBands(closes, 20).upper,
      bollinger_lower: this.bollingerBands(closes, 20).lower,
      bollinger_width: this.bollingerBands(closes, 20).width,
      atr: this.atr(data, 14),
      obv: this.obv(closes, volumes),
      mfi: this.mfi(highs, lows, closes, volumes, 14),
    };
  }

  // Crypto-specific features
  async calculateCryptoFeatures(symbol) {
    // In production, fetch funding rate, OI, dominance
    return {
      funding_rate: 0.0001, // Placeholder
      open_interest: 0, // Would fetch from exchange
      dominance: symbol.includes('BTC') ? 52 : 48,
      halving_cycle_position: 0.25, // Mid-cycle
    };
  }

  // Temporal features
  calculateTemporalFeatures() {
    const now = new Date();
    const utc = now.getUTCHours();
    
    let session;
    if (utc >= 0 && utc < 8) session = 'asian';
    else if (utc >= 8 && utc < 16) session = 'european';
    else session = 'us';
    
    return {
      hour_of_day: utc,
      day_of_week: now.getUTCDay(),
      trading_session: session,
      minutes_to_funding: (8 - (utc % 8)) * 60 - now.getUTCMinutes(),
    };
  }

  // Technical indicator helpers
  sma(data, period) {
    if (data.length < period) return data[data.length - 1];
    const slice = data.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
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

  macd(data, fast = 12, slow = 26, signal = 9) {
    const emaFast = this.ema(data, fast);
    const emaSlow = this.ema(data, slow);
    const macdLine = emaFast - emaSlow;
    // Signal would be EMA of MACD line
    return { macd: macdLine, signal: macdLine * 0.9 };
  }

  ema(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
      ema = data[i] * k + ema * (1 - k);
    }
    return ema;
  }

  bollingerBands(data, period = 20) {
    const sma = this.sma(data, period);
    const slice = data.slice(-period);
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    return {
      upper: sma + 2 * std,
      lower: sma - 2 * std,
      width: (4 * std) / sma,
    };
  }

  atr(data, period = 14) {
    if (data.length < period) return 0;
    
    let atr = 0;
    for (let i = data.length - period; i < data.length; i++) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i-1]?.close || 0),
        Math.abs(data[i].low - data[i-1]?.close || 0)
      );
      atr += tr;
    }
    return atr / period;
  }

  obv(closes, volumes) {
    let obv = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i-1]) obv += volumes[i];
      else if (closes[i] < closes[i-1]) obv -= volumes[i];
    }
    return obv;
  }

  mfi(highs, lows, closes, volumes, period) {
    const typicalPrices = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
    let positive = 0, negative = 0;
    
    for (let i = typicalPrices.length - period; i < typicalPrices.length; i++) {
      const flow = typicalPrices[i] * volumes[i];
      if (typicalPrices[i] > typicalPrices[i-1]) positive += flow;
      else negative += flow;
    }
    
    const mfi = 100 - (100 / (1 + positive / (negative || 1)));
    return mfi;
  }

  vwap(data) {
    let totalPV = 0, totalV = 0;
    data.forEach(d => {
      const typicalPrice = (d.high + d.low + d.close) / 3;
      totalPV += typicalPrice * d.volume;
      totalV += d.volume;
    });
    return totalPV / (totalV || 1);
  }

  calculatePeriodReturn(closes, periods) {
    if (closes.length < periods) return 0;
    return (closes[closes.length - 1] - closes[closes.length - periods]) / closes[closes.length - periods];
  }
}

// Model training placeholder (Week 2)
class ModelTrainer {
  constructor() {
    this.models = {};
    this.accuracy = {};
  }

  // Simple direction prediction (up/down)
  async trainDirectionModel(features, labels) {
    // In production: LSTM, XGBoost, or Transformer
    // For now: simple threshold-based model
    
    console.log(`Training on ${features.length} samples...`);
    
    // Mock training - in production would be real ML
    this.models.direction = { trained: true, accuracy: 0.58 };
    this.accuracy.direction = 0.58;
    
    return { accuracy: 0.58, status: 'trained' };
  }

  // Regime classifier (Week 3)
  async trainRegimeModel(features, regimes) {
    this.models.regime = { trained: true };
    return { status: 'trained' };
  }

  // Ensemble combiner (Week 4)
  ensemblePredict(predictions) {
    const weights = { lstm: 0.4, xgboost: 0.35, transformer: 0.25 };
    
    let weightedSum = 0;
    Object.keys(predictions).forEach(model => {
      weightedSum += predictions[model] * (weights[model] || 0.33);
    });
    
    return weightedSum;
  }
}

// Validation metrics
class ValidationMetrics {
  constructor() {
    this.predictions = [];
    this.actuals = [];
  }

  record(prediction, actual) {
    this.predictions.push(prediction);
    this.actuals.push(actual);
  }

  accuracy() {
    if (this.predictions.length === 0) return 0;
    const correct = this.predictions.filter((p, i) => 
      (p > 0.5 && this.actuals[i] === 1) || (p <= 0.5 && this.actuals[i] === 0)
    ).length;
    return correct / this.predictions.length;
  }

  calibration() {
    // Brier score or reliability diagram
    // When 80% confident, is it right 80% of the time?
    return { score: 0.85 }; // Placeholder
  }
}

module.exports = { FeatureEngine, ModelTrainer, ValidationMetrics, FEATURE_CATEGORIES };
