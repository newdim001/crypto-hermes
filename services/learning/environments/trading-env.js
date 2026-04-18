// CryptoEdge RL Trading Environment
// Gymnasium-compatible trading environment for reinforcement learning

const axios = require('axios');

class TradingEnvironment {
  constructor(config = {}) {
    this.initialBalance = config.initialBalance || 10000;
    this.balance = this.initialBalance;
    this.position = null;
    this.maxSteps = config.maxSteps || 1000;
    this.currentStep = 0;
    this.history = [];
    this.reward = 0;
  }
  
  reset() {
    this.balance = this.initialBalance;
    this.position = null;
    this.currentStep = 0;
    this.history = [];
    return this.getState();
  }
  
  async getMarketData(symbol = 'BTCUSDT', lookback = 20) {
    try {
      const r = await axios.get(`https://testnet.binance.vision/api/v3/klines?symbol=${symbol}&interval=1h&limit=${lookback}`);
      return r.data.map(k => ({
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));
    } catch (e) { return null; }
  }
  
  getState() {
    const lastPrice = this.history[this.history.length - 1]?.close || 0;
    const prevPrice = this.history[this.history.length - 2]?.close || lastPrice;
    
    return {
      balance: this.balance / this.initialBalance,
      position: this.position ? 1 : 0,
      positionPrice: this.position?.entryPrice || 0,
      priceChange: (lastPrice - prevPrice) / prevPrice,
      step: this.currentStep / this.maxSteps,
      unrealizedPnL: this.position ? (lastPrice - this.position.entryPrice) / this.position.entryPrice : 0
    };
  }
  
  async step(action) {
    // Actions: 0=HOLD, 1=BUY, 2=SELL, 3=CLOSE
    const price = this.history[this.history.length - 1]?.close || 0;
    let done = false;
    this.reward = 0;
    
    switch(action) {
      case 1: // BUY
        if (!this.position && this.balance > price * 0.001) {
          const qty = (this.balance * 0.95) / price;
          this.position = { entryPrice: price, quantity: qty, type: 'LONG' };
          this.balance -= qty * price;
        }
        break;
        
      case 2: // SELL (SHORT)
        if (!this.position) {
          const qty = (this.balance * 0.95) / price;
          this.position = { entryPrice: price, quantity: qty, type: 'SHORT' };
        }
        break;
        
      case 3: // CLOSE
        if (this.position) {
          const pnl = this.position.type === 'LONG' 
            ? (price - this.position.entryPrice) * this.position.quantity
            : (this.position.entryPrice - price) * this.position.quantity;
          this.reward = pnl / this.initialBalance * 100;
          this.balance += this.position.quantity * price + pnl;
          this.position = null;
        }
        break;
    }
    
    this.currentStep++;
    if (this.currentStep >= this.maxSteps) done = true;
    if (this.balance < this.initialBalance * 0.5) done = true; // 50% loss
    
    return { state: this.getState(), reward: this.reward, done };
  }
  
  // Reward function with penalties
  calculateReward() {
    let reward = this.reward;
    
    // Penalty for large drawdown
    if (this.balance < this.initialBalance * 0.9) reward -= 1;
    if (this.balance < this.initialBalance * 0.8) reward -= 5;
    
    // Penalty for holding too long
    if (this.position && this.currentStep % 100 === 0) reward -= 0.1;
    
    return reward;
  }
}

module.exports = TradingEnvironment;
