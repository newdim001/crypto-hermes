// CryptoEdge Graceful Degradation
// Partial functionality when systems fail

const axios = require('axios');

class GracefulDegradation {
  constructor() {
    this.tier = 'FULL'; // FULL, REDUCED, MINIMAL, EMERGENCY
    this.systems = {
      data: 'OK',
      exchange: 'OK',
      ml: 'OK',
      risk: 'OK'
    };
    this.failures = [];
  }
  
  // Check all systems
  async checkSystems() {
    const results = { data: 'OK', exchange: 'OK', ml: 'OK', risk: 'OK' };
    
    // Check data feed
    try {
      await axios.get('https://testnet.binance.vision/api/v3/ping', { timeout: 5000 });
    } catch (e) {
      results.data = 'FAIL';
    }
    
    // Check exchange
    try {
      await axios.get('https://testnet.binance.vision/api/v3/time', { timeout: 5000 });
    } catch (e) {
      results.exchange = 'FAIL';
    }
    
    this.systems = results;
    return this.determineTier();
  }
  
  determineTier() {
    const failed = Object.values(this.systems).filter(s => s === 'FAIL').length;
    
    let newTier = 'FULL';
    let action = 'Continue normal operations';
    
    if (failed === 0) {
      newTier = 'FULL';
      action = 'All systems operational';
    } else if (failed === 1) {
      newTier = 'REDUCED';
      action = 'Reduce to 50% position size, use cached data';
    } else if (failed === 2) {
      newTier = 'MINIMAL';
      action = 'Close positions, no new entries, monitor closely';
    } else {
      newTier = 'EMERGENCY';
      action = 'KILL SWITCH - Close all positions immediately';
    }
    
    if (newTier !== this.tier) {
      this.failures.push({
        timestamp: Date.now(),
        from: this.tier,
        to: newTier,
        systems: this.systems,
        action
      });
    }
    
    this.tier = newTier;
    return { tier: newTier, action, systems: this.systems };
  }
  
  // Get capabilities based on tier
  getCapabilities() {
    const caps = {
      FULL: {
        trading: true,
        newPositions: true,
        maxPositionSize: 0.10,
        mlSignals: true,
        riskChecks: true,
        alerts: true
      },
      REDUCED: {
        trading: true,
        newPositions: true,
        maxPositionSize: 0.05,
        mlSignals: true,
        riskChecks: true,
        alerts: true
      },
      MINIMAL: {
        trading: false,
        newPositions: false,
        maxPositionSize: 0,
        mlSignals: false,
        riskChecks: true,
        alerts: true
      },
      EMERGENCY: {
        trading: false,
        newPositions: false,
        maxPositionSize: 0,
        mlSignals: false,
        riskChecks: false,
        alerts: true
      }
    };
    
    return caps[this.tier];
  }
  
  // Recovery path
  async recover() {
    const status = await this.checkSystems();
    if (status.tier === 'FULL') {
      console.log('✅ All systems recovered to FULL functionality');
      return true;
    }
    return false;
  }
  
  getStatus() {
    return {
      tier: this.tier,
      systems: this.systems,
      capabilities: this.getCapabilities(),
      failures: this.failures.slice(-5)
    };
  }
}

module.exports = new GracefulDegradation();
