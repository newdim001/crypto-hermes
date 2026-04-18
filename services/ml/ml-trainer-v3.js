/**
 * ML Model Trainer v3
 * Retrains the trading model with enhanced indicators
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { 
  calculateRSI, 
  calculateEMA, 
  calculateMACD, 
  calculateBollingerBands,
  calculateStochastic,
  calculateATR,
  calculateADX,
  calculateCCI,
  calculateWilliamsR,
  calculateMFI,
  calculateROC,
  calculateOBV,
  calculateIchimoku,
  calculateAllIndicators
} = require('./technical-indicators-v3');

// Configuration
const CONFIG = {
  symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 
             'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT'],
  trainingDays: 90,
  lookbackPeriod: 50,
  epochs: 100,
  learningRate: 0.01
};

async function main() {
  console.log('🚀 ML Model Trainer v3 - Starting...\n');
  
  const trainingData = [];
  
  // Collect training data for each symbol
  for (const symbol of CONFIG.symbols) {
    console.log(`📊 Collecting data for ${symbol}...`);
    
    try {
      const candles = await fetchHistoricalData(symbol, CONFIG.trainingDays);
      
      if (candles.length < CONFIG.lookbackPeriod + 20) {
        console.log(`  ⚠️ Insufficient data for ${symbol}`);
        continue;
      }
      
      // Generate features and labels
      for (let i = CONFIG.lookbackPeriod; i < candles.length - 5; i++) {
        const windowData = candles.slice(i - CONFIG.lookbackPeriod, i);
        const futurePrices = candles.slice(i, i + 5);
        
        const indicators = calculateAllIndicators(windowData);
        if (!indicators) continue;
        
        // Feature vector
        const features = [
          normalize(indicators.rsi, 0, 100),
          normalize(indicators.macd.histogram, -5, 5),
          normalize(indicators.ema9 > indicators.ema21 ? 1 : 0, 0, 1),
          normalize(indicators.bbPosition, 0, 1),
          normalize(indicators.stochastic.k, 0, 100),
          normalize(indicators.adx.adx, 0, 50),
          normalize(indicators.volumeRatio, 0, 3),
          normalize(indicators.cci, -200, 200),
          normalize(indicators.williamsR, -100, 0),
          normalize(indicators.mfi, 0, 100),
          normalize(indicators.roc, -10, 10),
          normalize(indicators.obv, -1e9, 1e9)
        ];
        
        // Label: 1 if price goes up > 2% in 5 hours, -1 if down > 2%, 0 otherwise
        const priceChange = (futurePrices[4].close - candles[i].close) / candles[i].close * 100;
        
        let label;
        if (priceChange > 2) label = 1;
        else if (priceChange < -2) label = -1;
        else label = 0;
        
        trainingData.push({ features, label, symbol, priceChange });
      }
      
      console.log(`  ✅ Collected ${trainingData.length} samples`);
      
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }
  
  console.log(`\n📈 Total training samples: ${trainingData.length}`);
  
  if (trainingData.length < 100) {
    console.log('❌ Not enough training data!');
    return;
  }
  
  // Train model using simple logistic regression-like approach
  console.log('\n🧠 Training model...');
  
  const weights = trainLogisticRegression(trainingData);
  
  // Evaluate model
  const accuracy = evaluateModel(weights, trainingData);
  console.log(`\n📊 Training Accuracy: ${(accuracy * 100).toFixed(2)}%`);
  
  // Save model
  const modelData = {
    weights,
    accuracy,
    trained: new Date().toISOString(),
    samples: trainingData.length,
    config: CONFIG
  };
  
  const modelPath = path.join(__dirname, '../../data/ml-model-v3.json');
  fs.writeFileSync(modelPath, JSON.stringify(modelData, null, 2));
  
  console.log(`\n✅ Model saved to: ${modelPath}`);
  
  // Also update brain.json with new weights
  updateBrainWithNewWeights(weights);
  
  console.log('\n🎉 Training complete!');
}

function normalize(value, min, max) {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

function trainLogisticRegression(data) {
  // Initialize weights
  const numFeatures = 12;
  let weights = new Array(numFeatures).fill(0);
  let bias = 0;
  
  // Gradient descent
  for (let epoch = 0; epoch < CONFIG.epochs; epoch++) {
    let totalLoss = 0;
    
    for (const sample of data) {
      // Forward pass
      let logit = bias;
      for (let i = 0; i < numFeatures; i++) {
        logit += weights[i] * sample.features[i];
      }
      
      // Sigmoid
      const prob = 1 / (1 + Math.exp(-logit));
      
      // Label (convert -1/0/1 to 0/1)
      const y = sample.label === 1 ? 1 : sample.label === -1 ? 0 : 0.5;
      
      // Binary cross-entropy loss
      const loss = -(y * Math.log(prob + 1e-10) + (1 - y) * Math.log(1 - prob + 1e-10));
      totalLoss += loss;
      
      // Gradient
      const gradient = prob - y;
      for (let i = 0; i < numFeatures; i++) {
        weights[i] -= CONFIG.learningRate * gradient * sample.features[i];
      }
      bias -= CONFIG.learningRate * gradient;
    }
    
    if (epoch % 20 === 0) {
      console.log(`  Epoch ${epoch}/${CONFIG.epochs}, Loss: ${(totalLoss / data.length).toFixed(4)}`);
    }
  }
  
  return weights;
}

function evaluateModel(weights, data) {
  let correct = 0;
  
  for (const sample of data) {
    let logit = 0;
    for (let i = 0; i < weights.length; i++) {
      logit += weights[i] * sample.features[i];
    }
    
    const prob = 1 / (1 + Math.exp(-logit));
    const prediction = prob > 0.6 ? 1 : prob < 0.4 ? -1 : 0;
    
    if (prediction === sample.label) {
      correct++;
    }
  }
  
  return correct / data.length;
}

function updateBrainWithNewWeights(weights) {
  const brainPath = path.join(__dirname, '../../data/brain.json');
  
  let brain = {};
  try {
    brain = JSON.parse(fs.readFileSync(brainPath, 'utf8'));
  } catch (e) {
    brain = { weights: {}, symbolStats: {} };
  }
  
  // Map weights to indicator names
  const indicatorNames = ['rsi', 'macd', 'ema', 'bb', 'stochastic', 'adx', 'volume', 
                          'cci', 'williamsR', 'mfi', 'roc', 'obv'];
  
  // Convert to 0-100 scale
  const scaledWeights = {};
  for (let i = 0; i < indicatorNames.length; i++) {
    scaledWeights[indicatorNames[i]] = Math.abs(weights[i]) * 50;
  }
  
  brain.weights = { ...brain.weights, ...scaledWeights };
  brain.lastTrained = new Date().toISOString();
  brain.modelVersion = 'v3';
  
  fs.writeFileSync(brainPath, JSON.stringify(brain, null, 2));
  console.log('🧠 Brain updated with new weights');
}

async function fetchHistoricalData(symbol, days) {
  const API_URL = 'https://api.binance.com/api/v3/klines';
  
  try {
    const response = await axios.get(API_URL, {
      params: { symbol, interval: '1h', limit: days * 24 },
      timeout: 30000
    });
    
    return response.data.map(candle => ({
      openTime: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
      closeTime: candle[6]
    }));
  } catch (err) {
    throw err;
  }
}

// Run
main().catch(console.error);
