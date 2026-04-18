// CryptoEdge TWAP/VWAP Execution
// Time-weighted and volume-weighted order execution

class TWAPVWAPExecutor {
  constructor() {
    this.activeOrders = new Map();
  }

  // TWAP - Time Weighted Average Price
  createTWAP(symbol, totalQty, durationMinutes, slices = 10) {
    const sliceQty = totalQty / slices;
    const intervalMs = (durationMinutes * 60 * 1000) / slices;
    
    const orderId = `twap_${Date.now()}`;
    const schedule = [];
    
    for (let i = 0; i < slices; i++) {
      schedule.push({
        slice: i + 1,
        quantity: sliceQty,
        executeAt: Date.now() + (i * intervalMs),
        status: 'PENDING'
      });
    }
    
    this.activeOrders.set(orderId, {
      type: 'TWAP',
      symbol,
      totalQty,
      executedQty: 0,
      schedule,
      status: 'ACTIVE'
    });
    
    return {
      orderId,
      type: 'TWAP',
      symbol,
      totalQty,
      slices,
      sliceQty,
      intervalMs,
      estimatedDuration: durationMinutes + ' minutes'
    };
  }

  // VWAP - Volume Weighted Average Price
  createVWAP(symbol, totalQty, volumeProfile) {
    // volumeProfile: array of { percent: 20, window: '9:00-10:00' }
    const orderId = `vwap_${Date.now()}`;
    
    const schedule = volumeProfile.map((v, i) => ({
      slice: i + 1,
      quantity: totalQty * (v.percent / 100),
      window: v.window,
      status: 'PENDING'
    }));
    
    this.activeOrders.set(orderId, {
      type: 'VWAP',
      symbol,
      totalQty,
      executedQty: 0,
      schedule,
      status: 'ACTIVE'
    });
    
    return {
      orderId,
      type: 'VWAP',
      symbol,
      totalQty,
      slices: schedule.length,
      schedule
    };
  }

  // Execute next slice
  async executeNextSlice(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) return { error: 'Order not found' };
    
    const pendingSlice = order.schedule.find(s => s.status === 'PENDING');
    if (!pendingSlice) {
      order.status = 'COMPLETED';
      return { status: 'COMPLETED', executedQty: order.executedQty };
    }
    
    // In real implementation, execute the order here
    pendingSlice.status = 'EXECUTED';
    pendingSlice.executedAt = Date.now();
    order.executedQty += pendingSlice.quantity;
    
    return {
      executed: pendingSlice.slice,
      quantity: pendingSlice.quantity,
      totalExecuted: order.executedQty,
      remaining: order.totalQty - order.executedQty
    };
  }

  // Cancel order
  cancel(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) return { error: 'Order not found' };
    
    order.status = 'CANCELLED';
    return {
      cancelled: true,
      executedQty: order.executedQty,
      remainingQty: order.totalQty - order.executedQty
    };
  }

  // Get order status
  getStatus(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) return { error: 'Order not found' };
    
    return {
      orderId,
      type: order.type,
      status: order.status,
      progress: ((order.executedQty / order.totalQty) * 100).toFixed(1) + '%',
      executedQty: order.executedQty,
      remainingQty: order.totalQty - order.executedQty
    };
  }

  // Get all active orders
  getActive() {
    const active = [];
    for (const [id, order] of this.activeOrders) {
      if (order.status === 'ACTIVE') {
        active.push({ orderId: id, ...this.getStatus(id) });
      }
    }
    return active;
  }
}

module.exports = new TWAPVWAPExecutor();
