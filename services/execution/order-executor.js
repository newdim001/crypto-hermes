/**
 * Order Executor - Paper & Live order execution
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

const IS_PAPER = process.env.BINANCE_TESTNET === 'true' || process.env.PAPER_TRADING === 'true';
const STATE_FILE = path.join(__dirname, '../../data/state.json');

class OrderExecutor {
  constructor(config = {}) {
    this.isPaper = IS_PAPER;
    this.slippage = config.slippage || 0.0005; // 0.05%
    this.fee = config.fee || 0.001;            // 0.1%
  }

  getState() {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return { balance: 10000 }; }
  }

  saveState(state) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify({ ...this.getState(), ...state, lastSaved: Date.now() }, null, 2)); } catch (_) {}
  }

  async execute(order) {
    const { symbol, side, quantity, price, type = 'MARKET' } = order;

    if (this.isPaper) {
      return this.paperExecute(order);
    }
    // Live execution would go here
    throw new Error('Live trading not enabled. Set PAPER_TRADING=false to enable.');
  }

  async paperExecute(order) {
    const { symbol, side, quantity, price } = order;
    const slip = side === 'BUY' ? 1 + this.slippage : 1 - this.slippage;
    const execPrice = price * slip;
    const fee = execPrice * quantity * this.fee;

    const state = this.getState();
    const cost = side === 'BUY' ? execPrice * quantity + fee : -(execPrice * quantity - fee);
    state.balance = (state.balance || 10000) - cost;
    this.saveState(state);

    return {
      orderId: Date.now(),
      symbol,
      side,
      quantity,
      price: execPrice,
      fee,
      status: 'FILLED',
      isPaper: true,
      timestamp: new Date().toISOString()
    };
  }

  async closePosition(position, currentPrice) {
    const side = position.side === 'BUY' ? 'SELL' : 'BUY';
    return this.execute({ symbol: position.symbol, side, quantity: position.quantity, price: currentPrice });
  }

  async closeAllPositions(positions, prices = {}) {
    const results = [];
    for (const pos of positions) {
      const price = prices[pos.symbol] || pos.entryPrice;
      results.push(await this.closePosition(pos, price));
    }
    return results;
  }
}

module.exports = OrderExecutor;

// Named export for kill-switch-test compatibility
module.exports.closeAllPositions = async function(positions, prices = {}) {
  const ex = new OrderExecutor();
  return ex.closeAllPositions(positions, prices);
};
