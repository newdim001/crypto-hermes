// CryptoEdge Learning Rate Scheduling
// Adaptive learning rates based on performance

class LearningRateScheduler {
  constructor() {
    this.baseLR = 0.001;
    this.currentLR = 0.001;
    this.minLR = 0.0001;
    this.maxLR = 0.01;
    this.history = [];
    this.patience = 5;
    this.decayFactor = 0.5;
    this.warmupSteps = 100;
    this.currentStep = 0;
  }

  // Step the scheduler
  step(loss) {
    this.currentStep++;
    this.history.push({ step: this.currentStep, loss, lr: this.currentLR });
    
    // Warmup phase
    if (this.currentStep < this.warmupSteps) {
      this.currentLR = this.baseLR * (this.currentStep / this.warmupSteps);
      return this.getStatus('WARMUP');
    }
    
    // Check for plateau
    if (this.history.length >= this.patience) {
      const recent = this.history.slice(-this.patience);
      const oldLoss = recent[0].loss;
      const newLoss = recent[recent.length - 1].loss;
      
      // If loss not improving, reduce LR
      if (newLoss >= oldLoss * 0.99) {
        this.currentLR = Math.max(this.minLR, this.currentLR * this.decayFactor);
        return this.getStatus('REDUCED');
      }
      
      // If loss improving well, increase LR slightly
      if (newLoss < oldLoss * 0.9) {
        this.currentLR = Math.min(this.maxLR, this.currentLR * 1.1);
        return this.getStatus('INCREASED');
      }
    }
    
    return this.getStatus('STABLE');
  }

  // Get status
  getStatus(action) {
    return {
      step: this.currentStep,
      learningRate: this.currentLR.toExponential(4),
      action,
      phase: this.currentStep < this.warmupSteps ? 'WARMUP' : 'TRAINING'
    };
  }

  // Get current learning rate
  getLR() {
    return this.currentLR;
  }

  // Reset scheduler
  reset() {
    this.currentLR = this.baseLR;
    this.currentStep = 0;
    this.history = [];
    return { reset: true, lr: this.currentLR };
  }

  // Cosine annealing schedule
  cosineAnnealing(totalSteps) {
    const progress = this.currentStep / totalSteps;
    this.currentLR = this.minLR + 0.5 * (this.maxLR - this.minLR) * (1 + Math.cos(Math.PI * progress));
    return this.currentLR;
  }

  // Get history
  getHistory() {
    return this.history.slice(-50);
  }
}

module.exports = new LearningRateScheduler();
