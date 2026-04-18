// CryptoEdge Partial Fill Handler

class PartialFillHandler {
  constructor() {
    this.pendingOrders = new Map();
    this.maxWaitTime = 30000; // 30 seconds
  }
  
  // Handle partial fill response
  handle(order, fillResult) {
    const { filled, remaining, status } = fillResult;
    
    if (status === 'FULL') {
      return { action: 'COMPLETE', filled: filled };
    }
    
    if (status === 'PARTIAL') {
      const fillPercent = (filled / order.quantity) * 100;
      
      // Decision logic
      let action = 'CANCEL_REMAINING';
      let reason = '';
      
      if (fillPercent >= 80) {
        action = 'WAIT_COMPLETION';
        reason = 'Good fill, wait for rest';
      } else if (fillPercent >= 50) {
        action = 'ADJUST_STRATEGY';
        reason = 'Partial fill, adjust position';
      } else {
        action = 'CANCEL_REMAINING';
        reason = 'Poor fill, cancel and reassess';
      }
      
      return {
        action,
        reason,
        filled,
        remaining,
        fillPercent: fillPercent.toFixed(1) + '%',
        timestamp: Date.now()
      };
    }
    
    return { action: 'UNKNOWN', status };
  }
  
  // Track order
  track(orderId, order) {
    this.pendingOrders.set(orderId, {
      ...order,
      startTime: Date.now()
    });
  }
  
  // Check timeouts
  checkTimeouts() {
    const now = Date.now();
    const timedOut = [];
    
    for (const [id, order] of this.pendingOrders) {
      if (now - order.startTime > this.maxWaitTime) {
        timedOut.push({ id, order });
        this.pendingOrders.delete(id);
      }
    }
    
    return timedOut;
  }
}

module.exports = new PartialFillHandler();
