// CryptoEdge Agent Communication Protocol
// Message queuing and inter-agent communication

class MessageQueue {
  constructor() {
    this.queue = [];
    this.subscribers = new Map();
    this.maxLatencyMs = 100;
    this.messageSchema = {
      id: 'string',
      from: 'string',
      to: 'string',
      type: 'string',
      payload: 'object',
      timestamp: 'number',
      priority: 'number'
    };
  }

  // Publish message to queue
  publish(message) {
    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      priority: message.priority || 5,
      ...message
    };
    
    // Validate schema
    if (!this.validateSchema(msg)) {
      return { error: 'Invalid message schema' };
    }
    
    this.queue.push(msg);
    this.queue.sort((a, b) => b.priority - a.priority);
    
    // Notify subscribers
    this.notifySubscribers(msg);
    
    return { success: true, messageId: msg.id };
  }

  // Subscribe to messages
  subscribe(agentId, callback, filter = {}) {
    this.subscribers.set(agentId, { callback, filter });
    return { subscribed: agentId };
  }

  // Unsubscribe
  unsubscribe(agentId) {
    this.subscribers.delete(agentId);
  }

  // Notify subscribers
  notifySubscribers(message) {
    for (const [agentId, sub] of this.subscribers) {
      if (sub.filter.type && sub.filter.type !== message.type) continue;
      if (sub.filter.to && sub.filter.to !== agentId) continue;
      
      try {
        sub.callback(message);
      } catch (e) {
        console.error(`Subscriber ${agentId} error:`, e.message);
      }
    }
  }

  // Validate message schema
  validateSchema(msg) {
    return msg.from && msg.type && msg.payload;
  }

  // Get queue stats
  getStats() {
    return {
      queueLength: this.queue.length,
      subscribers: this.subscribers.size,
      oldestMessage: this.queue[0]?.timestamp || null
    };
  }

  // Broadcast to all agents
  broadcast(from, type, payload) {
    return this.publish({
      from,
      to: 'ALL',
      type,
      payload,
      priority: 10
    });
  }

  // Request-response pattern
  async request(from, to, type, payload, timeoutMs = 5000) {
    const requestId = `req_${Date.now()}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);
      
      this.publish({ from, to, type, payload: { ...payload, requestId } });
      
      // In real implementation, wait for response
      clearTimeout(timeout);
      resolve({ requestId, status: 'sent' });
    });
  }
}

module.exports = new MessageQueue();
