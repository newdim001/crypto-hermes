/**
 * ML Model Trainer
 * Train on historical data to predict direction
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '../../data/market');

// Load data
function loadData(symbol, interval) {
  const file = path.join(DATA_DIR, `${symbol}_${interval}.json`);
  if (fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file)).data;
  }
  return null;
}

// Feature extraction
function extractFeatures(candles) {
  if (candles.length < 50) return null;
  
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  
  // Returns
  const ret1 = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];
  const ret4 = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5];
  const ret24 = (closes[closes.length - 1] - closes[closes.length - 25]) / closes[closes.length - 25];
  
  // Moving averages
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const sma200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  
  // RSI
  let gains = 0, losses = 0;
  for (let i = closes.length - 15; i < closes.length; i++) {
    const c = closes[i] - closes[i - 1];
    if (c > 0) gains += c;
    else losses -= c;
  }
  const rsi = 100 - (100 / (1 + gains / (losses || 1)));
  
  // MACD
  const ema12 = closes.reduce((a, b, i) => i === 0 ? b : b * (2/13) + a * (1 - 2/13), 0);
  const ema26 = closes.reduce((a, b, i) => i === 0 ? b : b * (2/27) + a * (1 - 2/27), 0);
  const macd = ema12 - ema26;
  
  // Bollinger position
  const sma = sma20;
  const std = Math.sqrt(closes.slice(-20).reduce((s, v) => s + Math.pow(v - sma, 2), 0) / 20);
  const bbPos = (closes[closes.length - 1] - sma + 2 * std) / (4 * std);
  
  // Volume
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const volRatio = volumes[volumes.length - 1] / avgVol;
  
  // Volatility
  const returns = closes.slice(-24).map((c, i) => i > 0 ? (c - closes[i-1])/closes[i-1] : 0);
  const volatility = Math.sqrt(returns.reduce((s, r) => s + r*r, 0) / returns.length) * 100;
  
  // Trend
  const trend = closes[closes.length - 1] > sma200 ? 1 : -1;
  
  // Features array
  return [
    ret1 * 10,      // Normalized return 1h
    ret4 * 10,      // Normalized return 4h
    ret24 * 10,     // Normalized return 24h
    (closes[closes.length - 1] - sma20) / sma20 * 10,  // Price vs MA20
    (closes[closes.length - 1] - sma50) / sma50 * 10,  // Price vs MA50
    (closes[closes.length - 1] - sma200) / sma200 * 10, // Price vs MA200
    rsi / 100,      // RSI normalized
    macd / closes[closes.length - 1] * 100, // MACD normalized
    bbPos,          // Bollinger position
    volRatio,       // Volume ratio
    volatility,    // Volatility
    trend,         // Trend direction
  ];
}

// Create training dataset
function createDataset(candles) {
  const X = [];
  const y = [];
  
  for (let i = 201; i < candles.length - 4; i++) {
    const features = extractFeatures(candles.slice(0, i + 1));
    if (!features) continue;
    
    // Label: 1 if price goes up in 4 hours, 0 otherwise
    const futurePrice = candles[i + 4].close;
    const currentPrice = candles[i].close;
    const label = futurePrice > currentPrice ? 1 : 0;
    
    X.push(features);
    y.push(label);
  }
  
  return { X, y };
}

// Simple logistic regression (from scratch)
class LogisticRegression {
  constructor(learningRate = 0.01, iterations = 1000) {
    this.lr = learningRate;
    this.iterations = iterations;
    this.weights = null;
    this.bias = 0;
  }
  
  sigmoid(z) {
    return 1 / (1 + Math.exp(-Math.min(z, 20))); // Prevent overflow
  }
  
  fit(X, y) {
    const nFeatures = X[0].length;
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;
    
    for (let iter = 0; iter < this.iterations; iter++) {
      let dw = new Array(nFeatures).fill(0);
      let db = 0;
      
      for (let i = 0; i < X.length; i++) {
        const z = this.weights.reduce((s, w, j) => s + w * X[i][j], 0) + this.bias;
        const pred = this.sigmoid(z);
        const error = pred - y[i];
        
        for (let j = 0; j < nFeatures; j++) {
          dw[j] += error * X[i][j];
        }
        db += error;
      }
      
      // Update
      for (let j = 0; j < nFeatures; j++) {
        this.weights[j] -= this.lr * dw[j] / X.length;
      }
      this.bias -= this.lr * db / X.length;
    }
    
    console.log('✅ Training complete');
  }
  
  predict(X) {
    return X.map(x => {
      const z = this.weights.reduce((s, w, j) => s + w * x[j], 0) + this.bias;
      return this.sigmoid(z);
    });
  }
  
  accuracy(X, y) {
    const preds = this.predict(X).map(p => p > 0.5 ? 1 : 0);
    const correct = preds.filter((p, i) => p === y[i]).length;
    return correct / y.length;
  }
}

// Train model
async function trainModel() {
  console.log('🧠 ML Model Training\n');
  console.log('='.repeat(45));
  
  // Load BTC data
  const candles = loadData('BTCUSDT', '1h');
  if (!candles) {
    console.log('❌ No data found');
    return;
  }
  
  console.log(`Total candles: ${candles.length}`);
  
  // Create dataset
  const { X, y } = createDataset(candles);
  console.log(`Training samples: ${X.length}`);
  
  // Split: 80% train, 20% test
  const split = Math.floor(X.length * 0.8);
  const X_train = X.slice(0, split);
  const y_train = y.slice(0, split);
  const X_test = X.slice(split);
  const y_test = y.slice(split);
  
  console.log(`Train: ${X_train.length}, Test: ${X_test.length}\n`);
  
  // Train
  const model = new LogisticRegression(0.1, 500);
  model.fit(X_train, y_train);
  
  // Evaluate
  const trainAcc = model.accuracy(X_train, y_train);
  const testAcc = model.accuracy(X_test, y_test);
  
  console.log('\n📊 TRAINING RESULTS:');
  console.log('='.repeat(45));
  console.log(`Training Accuracy: ${(trainAcc * 100).toFixed(1)}%`);
  console.log(`Test Accuracy:      ${(testAcc * 100).toFixed(1)}%`);
  
  // Feature importance (weights)
  const featureNames = ['ret1h', 'ret4h', 'ret24h', 'vsMA20', 'vsMA50', 'vsMA200', 'RSI', 'MACD', 'BB', 'Vol', 'Volatility', 'Trend'];
  console.log('\n📈 Feature Weights:');
  model.weights.forEach((w, i) => {
    if (Math.abs(w) > 0.01) {
      console.log(`  ${featureNames[i].padEnd(12)}: ${w > 0 ? '+' : ''}${w.toFixed(4)}`);
    }
  });
  
  // Save model
  const modelData = {
    weights: model.weights,
    bias: model.bias,
    trained: new Date().toISOString(),
    accuracy: { train: trainAcc, test: testAcc },
  };
  
  fs.writeFileSync(
    path.join(__dirname, '../../data/ml-model.json'),
    JSON.stringify(modelData, null, 2)
  );
  
  console.log('\n✅ Model saved to data/ml-model.json');
  
  return modelData;
}

// Predict
function predict(candles, modelData) {
  const features = extractFeatures(candles);
  if (!features) return { signal: 0, confidence: 0 };
  
  const z = modelData.weights.reduce((s, w, i) => s + w * features[i], 0) + modelData.bias;
  const prob = 1 / (1 + Math.exp(-z));
  
  const signal = prob > 0.5 ? 1 : -1;
  const confidence = Math.abs(prob - 0.5) * 2;
  
  return { signal, confidence, probability: prob };
}

// Run
trainModel();
