// CryptoEdge Rate Limit Management
// Request queuing for API rate limits

class RateLimiter {
  constructor() {
    this.limits = {
      orders: { max: 10, window: 1000 },      // 10 orders/second
      requests: { max: 1200, window: 60000 }, // 1200 requests/minute
      weight: { max: 1200, window: 60000 }    // Weight limit
    };
    
    this.usage = {
      orders: [],
      requests: [],
      weight: 0
    };
    
    this.queue = [];
    this.processing = false;
  }

  // Check if request allowed
  canMakeRequest(type = 'requests', weight = 1) {
    this.cleanupOldEntries();
    
    const limit = this.limits[type];
    const count = this.usage[type].length;
    
    return count < limit.max;
  }

  // Record request
  recordRequest(type = 'requests', weight = 1) {
    this.usage[type].push(Date.now());
    this.usage.weight += weight;
    
    return {
      recorded: true,
      remaining: this.limits[type].max - this.usage[type].length
    };
  }

  // Cleanup old entries
  cleanupOldEntries() {
    const now = Date.now();
    
    for (const type of ['orders', 'requests']) {
      const window = this.limits[type].window;
      this.usage[type] = this.usage[type].filter(t => now - t < window);
    }
  }

  // Queue request
  enqueue(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject });
      this.processQueue();
    });
  }

  // Process queue
  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      if (!this.canMakeRequest()) {
        await this.wait(100);
        continue;
      }
      
      const { request, resolve, reject } = this.queue.shift();
      
      try {
        this.recordRequest();
        const result = await request();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    }
    
    this.processing = false;
  }

  // Wait helper
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current usage
  getUsage() {
    this.cleanupOldEntries();
    
    return {
      orders: {
        used: this.usage.orders.length,
        limit: this.limits.orders.max,
        remaining: this.limits.orders.max - this.usage.orders.length
      },
      requests: {
        used: this.usage.requests.length,
        limit: this.limits.requests.max,
        remaining: this.limits.requests.max - this.usage.requests.length
      },
      queueLength: this.queue.length
    };
  }

  // Reset (after rate limit hit)
  reset() {
    this.usage = { orders: [], requests: [], weight: 0 };
    return { reset: true };
  }
}

module.exports = new RateLimiter();
