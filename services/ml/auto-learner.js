/**
 * Auto-Learner: Generates training data from market candles
 */

const fs = require('fs');
const path = require('path');

// Load market data (new format)
function loadMarketData(symbol) {
    const dataDir = path.join(__dirname, '../../data/market');
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith(symbol) && f.endsWith('.json'));
    
    let allData = [];
    for (const file of files) {
        try {
            const raw = JSON.parse(fs.readFileSync(path.join(dataDir, file)));
            if (raw.data && Array.isArray(raw.data)) {
                allData = allData.concat(raw.data);
            }
        } catch (e) {}
    }
    
    return allData.sort((a, b) => a.time - b.time);
}

// Calculate features from candles
function calculateFeatures(candles) {
    if (!candles || candles.length < 50) return null;
    
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);
    
    // Returns
    const ret1h = (closes[closes.length - 1] / closes[Math.max(0, closes.length - 5)] - 1) || 0;
    const ret4h = (closes[closes.length - 1] / closes[Math.max(0, closes.length - 17)] - 1) || 0;
    const ret24h = (closes[closes.length - 1] / closes[Math.max(0, closes.length - 97)] - 1) || 0;
    
    // Moving averages
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : ma50;
    
    // RSI
    let gains = 0, losses = 0;
    for (let i = closes.length - 14; i < closes.length; i++) {
        if (i > 0) {
            const diff = closes[i] - closes[i-1];
            if (diff > 0) gains += diff;
            else losses -= diff;
        }
    }
    const rs = gains / (losses || 1);
    const rsi = 100 - (100 / (1 + rs));
    
    // MACD
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macd = (ema12 - ema26) / closes[closes.length - 1];
    
    // Bollinger Bands
    const ma = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const std = Math.sqrt(closes.slice(-20).reduce((a, b) => a + Math.pow(b - ma, 2), 0) / 20);
    const bb = std > 0 ? (closes[closes.length - 1] - ma) / (2 * std) : 0;
    
    // Volume
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const vol = avgVolume > 0 ? volumes[volumes.length - 1] / avgVolume : 1;
    
    // Volatility
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);
    
    // Trend
    const trend = ma20 > ma50 ? 1 : 0;
    
    return [
        ret1h, ret4h, ret24h,
        closes[closes.length - 1] / ma20 - 1,
        closes[closes.length - 1] / ma50 - 1,
        closes[closes.length - 1] / ma200 - 1,
        rsi / 100,
        macd,
        bb,
        vol,
        volatility,
        trend
    ];
}

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

// Generate training data
function generateTrainingData() {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'];
    const trainingData = [];
    
    for (const symbol of symbols) {
        console.log(`Processing ${symbol}...`);
        const candles = loadMarketData(symbol);
        
        if (!candles || candles.length < 200) {
            console.log(`  ⚠️ Not enough data for ${symbol}`);
            continue;
        }
        
        // Generate samples (every 10 candles to avoid redundancy)
        for (let i = 100; i < candles.length - 20; i += 10) {
            const past = candles.slice(Math.max(0, i - 100), i);
            const future = candles.slice(i, Math.min(candles.length, i + 20));
            
            const features = calculateFeatures(past);
            if (!features) continue;
            
            // Label: did price go up more than 1% in next 20 candles?
            const currentPrice = candles[i].close;
            const futurePrice = future[future.length - 1].close;
            const futureHigh = Math.max(...future.map(c => c.high));
            
            const label = (futurePrice > currentPrice * 1.01 || futureHigh > currentPrice * 1.02) ? 1 : 0;
            
            trainingData.push({
                features,
                label,
                symbol,
                timestamp: candles[i].time
            });
        }
        
        console.log(`  ✅ ${candles.length} candles -> ${Math.floor((candles.length - 120) / 10)} samples`);
    }
    
    return trainingData;
}

// Main
console.log("🧠 Generating training data...\n");
const trainingData = generateTrainingData();

// Save
const outputPath = path.join(__dirname, '../../data/training-data.json');
fs.writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));

console.log(`\n✅ Generated ${trainingData.length} training samples`);

// Stats
const ups = trainingData.filter(t => t.label === 1).length;
const downs = trainingData.filter(t => t.label === 0).length;
console.log(`📊 Labels: UP=${ups} (${Math.round(ups/trainingData.length*100)}%), DOWN=${downs} (${Math.round(downs/trainingData.length*100)}%)`);
