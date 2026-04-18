// CryptoEdge ML Model Trainer
// Trains models for directional prediction

const fs = require('fs');
const path = require('path');

class MLTrainer {
  constructor() {
    this.modelsDir = path.join(__dirname, '../../models');
    this.ensureDir(this.modelsDir);
  }
  
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // Generate training data from historical features
  generateTrainingData(historicalFeatures) {
    // Create labels using FORWARD-LOOKING returns (look ahead 4 candles)
    const trainingData = [];
    const LOOKAHEAD = 4; // predict 4 candles ahead
    const MIN_MOVE = 0.003; // 0.3% minimum move to generate signal

    for (let i = 1; i < historicalFeatures.length - LOOKAHEAD; i++) {
      const current = historicalFeatures[i];
      const future = historicalFeatures[i + LOOKAHEAD];

      if (!current.price || !future.price) continue;

      // Forward return
      const fwdReturn = (future.price - current.price) / current.price;

      // Only label strong moves (avoid noise)
      if (Math.abs(fwdReturn) < MIN_MOVE) continue;
      const label = fwdReturn > 0 ? 1 : 0;

      // Richer feature set
      const macdNorm = current.macd && current.price ? Math.max(-0.05, Math.min(0.05, current.macd / current.price)) : 0;
      const smaSlope = current.sma_20 && current.sma_50 ? (current.sma_20 - current.sma_50) / current.sma_50 : 0;

      const features = [
        (current.rsi_14 || 50) / 100,
        (current.rsi_7 || 50) / 100,
        macdNorm / 0.05,                              // normalized -1 to 1
        Math.min(2, current.volatility_20 || 1) / 2,
        Math.max(-1, Math.min(1, (current.momentum_10 || 0) / 10)),
        Math.min(3, current.volume_ratio || 1) / 3,
        Math.max(-0.05, Math.min(0.05, current.returns_1h || 0)) / 0.05,
        Math.max(-0.1, Math.min(0.1, current.returns_4h || 0)) / 0.1,
        Math.max(-0.1, Math.min(0.1, current.price_vs_sma20 || 0)) / 0.1,
        Math.max(-0.1, Math.min(0.1, smaSlope)) / 0.1,
        // RSI regime: oversold/overbought
        (current.rsi_14 || 50) < 35 ? 1 : 0,
        (current.rsi_14 || 50) > 65 ? 1 : 0,
      ];

      trainingData.push({ features, label });
    }

    return trainingData;
  }
  
  // Simple logistic regression (from scratch)
  sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
  }
  
  trainLogisticRegression(trainingData, iterations = 1000, learningRate = 0.1) {
    const numFeatures = trainingData[0].features.length;
    let weights = new Array(numFeatures).fill(0);
    let bias = 0;
    
    for (let iter = 0; iter < iterations; iter++) {
      let totalLoss = 0;
      
      for (const data of trainingData) {
        const z = bias + data.features.reduce((sum, f, i) => sum + f * weights[i], 0);
        const prediction = this.sigmoid(z);
        
        // Binary cross entropy loss
        const loss = -data.label * Math.log(prediction + 1e-10) - (1 - data.label) * Math.log(1 - prediction + 1e-10);
        totalLoss += loss;
        
        // Update weights
        const error = prediction - data.label;
        bias -= learningRate * error;
        weights = weights.map((w, i) => w - learningRate * error * data.features[i]);
      }
      
      if (iter % 100 === 0) {
        console.log(`  Iteration ${iter}: Loss = ${(totalLoss / trainingData.length).toFixed(4)}`);
      }
    }
    
    return { weights, bias };
  }
  
  // Evaluate model
  evaluateModel(model, testData) {
    let correct = 0;
    let truePositives = 0, falsePositives = 0;
    let trueNegatives = 0, falseNegatives = 0;
    
    for (const data of testData) {
      const z = model.bias + data.features.reduce((sum, f, i) => sum + f * model.weights[i], 0);
      const prediction = this.sigmoid(z) > 0.5 ? 1 : 0;
      
      if (prediction === data.label) correct++;
      
      if (prediction === 1 && data.label === 1) truePositives++;
      if (prediction === 1 && data.label === 0) falsePositives++;
      if (prediction === 0 && data.label === 1) falseNegatives++;
      if (prediction === 0 && data.label === 0) trueNegatives++;
    }
    
    const accuracy = correct / testData.length;
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1 = 2 * (precision * recall) / (precision + recall) || 0;
    
    return { accuracy, precision, recall, f1 };
  }
  
  // Make prediction
  predict(model, features) {
    const z = model.bias + features.reduce((sum, f, i) => sum + f * model.weights[i], 0);
    const probability = this.sigmoid(z);
    return { direction: probability > 0.5 ? 'UP' : 'DOWN', confidence: Math.abs(probability - 0.5) * 2 };
  }
  
  // Save model
  saveModel(model, name) {
    const filepath = path.join(this.modelsDir, `${name}.json`);
    fs.writeFileSync(filepath, JSON.stringify(model));
    console.log(`✅ Model saved: ${filepath}`);
  }
  
  // Load model
  loadModel(name) {
    const filepath = path.join(this.modelsDir, `${name}.json`);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
    return null;
  }
}

module.exports = new MLTrainer();

// Example usage
if (require.main === module) {
  // Generate sample training data
  const trainer = new MLTrainer();
  
  // Mock historical data (in real usage, load from database)
  const mockData = [];
  for (let i = 0; i < 1000; i++) {
    mockData.push({
      rsi_14: 30 + Math.random() * 40,
      rsi_7: 30 + Math.random() * 40,
      macd: Math.random() * 100 - 50,
      volatility_20: Math.random() * 5,
      momentum_10: Math.random() * 10 - 5,
      volume_ratio: 0.5 + Math.random(),
      returns_1h: Math.random() * 6 - 3,
      returns_4h: Math.random() * 12 - 6,
      price_vs_sma20: Math.random() * 10 - 5,
      returns_4h: Math.random() * 10 - 5, // Label derived from this
    });
  }
  
  // Add label based on returns_4h
  const trainingData = mockData.map(d => ({
    features: [
      d.rsi_14 / 100,
      d.rsi_7 / 100,
      d.macd / 100,
      d.volatility_20 / 100,
      d.momentum_10 / 100,
      d.volume_ratio,
      d.returns_1h / 100,
      d.returns_4h / 100,
      d.price_vs_sma20 / 100,
      0
    ],
    label: d.returns_4h > 0 ? 1 : 0
  }));
  
  console.log('🎯 Training model...');
  const model = trainer.trainLogisticRegression(trainingData);
  
  console.log('\n📊 Evaluating...');
  const metrics = trainer.evaluateModel(model, trainingData.slice(-200));
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%`);
  console.log(`F1 Score: ${metrics.f1.toFixed(3)}`);
  
  trainer.saveModel(model, 'direction_predictor');
  
  console.log('\n✅ Model training complete!');
}
