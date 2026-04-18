const { getVolumeSignal, getTrendSignal, getMACDSignal, getRSISignal, getBBSignal, getEMASignal } = require('./signal-generator-v3');

class LearnedSignalGenerator {
    constructor() {
        this.weights = {
            volume: 0.60,      // 87% accurate - HEAVY weight
            trend: 0.15,       // ~47% accurate
            macd: 0.10,        // ~47% accurate
            ema: 0.05,         // ~47% accurate
            rsi: 0.05,         // 24% accurate - minimal
            bb: 0.05           // 6% accurate - minimal
        };
        this.scoreThreshold = 0.70; // Only high-conviction signals
        this.requiredVolumeAgreement = true; // Volume must agree
    }

    generateSignal(symbol, data) {
        // Get raw signals from v3 generator
        const signals = {
            volume: getVolumeSignal(data),
            trend: getTrendSignal(data),
            macd: getMACDSignal(data),
            ema: getEMASignal(data),
            rsi: getRSISignal(data),
            bb: getBBSignal(data)
        };

        // Normalize signals to -1 (bearish), 0 (neutral), 1 (bullish)
        const normalized = {};
        for (const [key, value] of Object.entries(signals)) {
            if (value > 0.5) normalized[key] = 1;
            else if (value < -0.5) normalized[key] = -1;
            else normalized[key] = 0;
        }

        // Calculate weighted score
        let totalWeight = 0;
        let weightedSum = 0;
        
        for (const [indicator, weight] of Object.entries(this.weights)) {
            const signal = normalized[indicator];
            if (signal !== 0) { // Only count non-neutral signals
                weightedSum += signal * weight;
                totalWeight += weight;
            }
        }

        // Avoid division by zero
        if (totalWeight === 0) return { direction: 0, score: 0, confidence: 0 };
        
        const rawScore = weightedSum / totalWeight; // Range: -1 to 1
        const confidence = Math.abs(rawScore);
        
        // Apply volume agreement requirement
        const volumeAgrees = normalized.volume !== 0 && 
                            Math.sign(rawScore) === normalized.volume;
        
        // Final decision logic
        let direction = 0;
        let finalScore = 0;
        
        if (confidence >= this.scoreThreshold && 
            (!this.requiredVolumeAgreement || volumeAgrees)) {
            direction = Math.sign(rawScore);
            finalScore = confidence;
        }

        return {
            direction, // -1 = sell, 0 = hold, 1 = buy
            score: finalScore,
            confidence: finalScore,
            details: {
                rawScore,
                volumeSignal: normalized.volume,
                volumeAgrees,
                individualSignals: normalized
            }
        };
    }

    // Method to update weights based on new performance data
    updateWeights(performanceData) {
        // Placeholder for future learning capability
        // Would adjust weights based on recent indicator accuracy
        console.log('Weight update called - learning disabled in v1');
    }
}

module.exports = LearnedSignalGenerator;