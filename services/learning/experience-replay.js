// CryptoEdge Experience Replay - FIXED
class ExperienceReplay {
  constructor(capacity = 10000) {
    this.buffer = [];
    this.capacity = capacity;
  }
  
  push(experience) {
    this.buffer.push(experience);
    if (this.buffer.length > this.capacity) this.buffer.shift();
  }
  
  sample(batchSize = 32) {
    const indices = [];
    while (indices.length < batchSize && indices.length < this.buffer.length) {
      const idx = Math.floor(Math.random() * this.buffer.length);
      if (!indices.includes(idx)) indices.push(idx);
    }
    return indices.map(i => this.buffer[i]);
  }
  
  sampleByRegime(regime, batchSize = 32) {
    const regimeExp = this.buffer.filter(e => e.regime === regime);
    const others = this.buffer.filter(e => e.regime !== regime);
    const sample = [];
    const perRegime = Math.floor(batchSize / 2);
    for (let i = 0; i < perRegime && i < regimeExp.length; i++) {
      sample.push(regimeExp[Math.floor(Math.random() * regimeExp.length)]);
    }
    for (let i = 0; i < perRegime && i < others.length; i++) {
      sample.push(others[Math.floor(Math.random() * others.length)]);
    }
    return sample;
  }
  
  getStats() {
    const regimes = {};
    for (const exp of this.buffer) {
      regimes[exp.regime] = (regimes[exp.regime] || 0) + 1;
    }
    return { total: this.buffer.length, byRegime: regimes, capacity: this.capacity };
  }
}

const experienceReplay = new ExperienceReplay();
module.exports = experienceReplay;

if (require.main === module) {
  experienceReplay.push({ state: {}, action: 1, reward: 0.5, regime: 'BULL' });
  experienceReplay.push({ state: {}, action: 2, reward: -0.2, regime: 'BEAR' });
  console.log('Stats:', experienceReplay.getStats());
}
