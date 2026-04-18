// CryptoEdge Exchange Error Handling
// Map and handle all Binance error codes

class ExchangeErrorHandler {
  constructor() {
    this.errorCodes = {
      // Order errors
      '-1000': { type: 'UNKNOWN', action: 'RETRY', delay: 1000 },
      '-1001': { type: 'DISCONNECTED', action: 'RECONNECT', delay: 5000 },
      '-1002': { type: 'UNAUTHORIZED', action: 'CHECK_API_KEY', delay: 0 },
      '-1003': { type: 'TOO_MANY_REQUESTS', action: 'BACKOFF', delay: 60000 },
      '-1006': { type: 'UNEXPECTED_RESPONSE', action: 'RETRY', delay: 1000 },
      '-1007': { type: 'TIMEOUT', action: 'RETRY', delay: 2000 },
      '-1014': { type: 'UNKNOWN_ORDER_COMPOSITION', action: 'LOG', delay: 0 },
      '-1015': { type: 'TOO_MANY_ORDERS', action: 'WAIT', delay: 60000 },
      '-1016': { type: 'SERVICE_SHUTTING_DOWN', action: 'STOP', delay: 0 },
      '-1020': { type: 'UNSUPPORTED_OPERATION', action: 'LOG', delay: 0 },
      '-1021': { type: 'INVALID_TIMESTAMP', action: 'SYNC_TIME', delay: 1000 },
      '-1022': { type: 'INVALID_SIGNATURE', action: 'CHECK_API_KEY', delay: 0 },
      
      // Trading errors
      '-2010': { type: 'NEW_ORDER_REJECTED', action: 'LOG', delay: 0 },
      '-2011': { type: 'CANCEL_REJECTED', action: 'VERIFY_ORDER', delay: 1000 },
      '-2013': { type: 'NO_SUCH_ORDER', action: 'LOG', delay: 0 },
      '-2014': { type: 'BAD_API_KEY_FMT', action: 'CHECK_API_KEY', delay: 0 },
      '-2015': { type: 'REJECTED_MBX_KEY', action: 'CHECK_API_KEY', delay: 0 },
      
      // Balance errors
      '-2018': { type: 'BALANCE_NOT_SUFFICIENT', action: 'REDUCE_SIZE', delay: 0 },
      '-2019': { type: 'MARGIN_NOT_SUFFICIENT', action: 'REDUCE_LEVERAGE', delay: 0 },
      '-2020': { type: 'UNABLE_TO_FILL', action: 'RETRY_MARKET', delay: 500 },
      '-2021': { type: 'ORDER_WOULD_TRIGGER_IMMEDIATELY', action: 'ADJUST_PRICE', delay: 0 },
      '-2022': { type: 'REDUCE_ONLY_REJECT', action: 'LOG', delay: 0 },
      '-2026': { type: 'ORDER_NOT_FOUND', action: 'LOG', delay: 0 }
    };
    
    this.retryCount = new Map();
    this.maxRetries = 3;
  }

  // Handle error
  handle(errorCode, context = {}) {
    const code = String(errorCode);
    const errorInfo = this.errorCodes[code] || { 
      type: 'UNKNOWN_ERROR', 
      action: 'LOG', 
      delay: 0 
    };
    
    // Track retries
    const key = `${code}_${context.orderId || 'generic'}`;
    const retries = (this.retryCount.get(key) || 0) + 1;
    this.retryCount.set(key, retries);
    
    const canRetry = retries < this.maxRetries && errorInfo.action === 'RETRY';
    
    return {
      code,
      type: errorInfo.type,
      action: canRetry ? 'RETRY' : errorInfo.action,
      delay: errorInfo.delay,
      retries,
      canRetry,
      recommendation: this.getRecommendation(errorInfo.action)
    };
  }

  // Get recommendation
  getRecommendation(action) {
    const recommendations = {
      'RETRY': 'Temporary issue, retry after delay',
      'RECONNECT': 'Connection lost, reconnecting...',
      'CHECK_API_KEY': 'API key issue - verify credentials',
      'BACKOFF': 'Rate limited - waiting before retry',
      'STOP': 'Service unavailable - stopping trading',
      'SYNC_TIME': 'Time sync issue - synchronizing...',
      'LOG': 'Non-recoverable - logged for review',
      'VERIFY_ORDER': 'Order state uncertain - verifying...',
      'REDUCE_SIZE': 'Insufficient balance - reduce position',
      'REDUCE_LEVERAGE': 'Margin issue - reduce leverage',
      'RETRY_MARKET': 'Limit unfillable - try market order',
      'ADJUST_PRICE': 'Price issue - adjust order price'
    };
    return recommendations[action] || 'Unknown action';
  }

  // Clear retry count
  clearRetries(key) {
    this.retryCount.delete(key);
  }

  // Get all error types
  getErrorTypes() {
    const types = new Set();
    for (const info of Object.values(this.errorCodes)) {
      types.add(info.type);
    }
    return Array.from(types);
  }
}

module.exports = new ExchangeErrorHandler();
