// CryptoEdge Alert Fatigue Prevention
// Throttle and group alerts

class AlertThrottler {
  constructor() {
    this.alerts = new Map(); // type -> last sent time
    this.groups = new Map(); // group -> alerts
    this.config = {
      minInterval: 300000,     // 5 minutes between same alerts
      groupingWindow: 60000,   // 1 minute grouping window
      maxAlertsPerHour: 20,
      quietHours: { start: 23, end: 7 } // 11 PM - 7 AM
    };
    this.hourlyCount = 0;
    this.lastHourReset = Date.now();
  }

  // Should send alert?
  shouldSend(type, severity = 'INFO') {
    this.checkHourlyReset();
    
    // Always send critical
    if (severity === 'CRITICAL') {
      return { send: true, reason: 'Critical alert' };
    }
    
    // Check quiet hours (except critical)
    if (this.inQuietHours()) {
      return { send: false, reason: 'Quiet hours' };
    }
    
    // Check hourly limit
    if (this.hourlyCount >= this.config.maxAlertsPerHour) {
      return { send: false, reason: 'Hourly limit reached' };
    }
    
    // Check throttle
    const lastSent = this.alerts.get(type);
    if (lastSent && Date.now() - lastSent < this.config.minInterval) {
      return { 
        send: false, 
        reason: 'Throttled',
        nextAllowed: new Date(lastSent + this.config.minInterval).toISOString()
      };
    }
    
    return { send: true, reason: 'OK' };
  }

  // Record sent alert
  recordSent(type) {
    this.alerts.set(type, Date.now());
    this.hourlyCount++;
  }

  // Check hourly reset
  checkHourlyReset() {
    if (Date.now() - this.lastHourReset > 3600000) {
      this.hourlyCount = 0;
      this.lastHourReset = Date.now();
    }
  }

  // Check quiet hours
  inQuietHours() {
    const hour = new Date().getHours();
    const { start, end } = this.config.quietHours;
    
    if (start > end) {
      return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
  }

  // Group similar alerts
  addToGroup(group, alert) {
    if (!this.groups.has(group)) {
      this.groups.set(group, { alerts: [], lastSent: 0 });
    }
    
    const groupData = this.groups.get(group);
    groupData.alerts.push({ ...alert, timestamp: Date.now() });
    
    // Send grouped alert if window passed
    if (Date.now() - groupData.lastSent > this.config.groupingWindow) {
      const summary = this.summarizeGroup(group);
      groupData.alerts = [];
      groupData.lastSent = Date.now();
      return { sendSummary: true, summary };
    }
    
    return { sendSummary: false, grouped: true };
  }

  // Summarize group
  summarizeGroup(group) {
    const groupData = this.groups.get(group);
    if (!groupData || groupData.alerts.length === 0) return null;
    
    return {
      group,
      count: groupData.alerts.length,
      firstAt: new Date(groupData.alerts[0].timestamp).toISOString(),
      lastAt: new Date(groupData.alerts[groupData.alerts.length - 1].timestamp).toISOString(),
      types: [...new Set(groupData.alerts.map(a => a.type))]
    };
  }

  // Get stats
  getStats() {
    return {
      alertsSentThisHour: this.hourlyCount,
      maxPerHour: this.config.maxAlertsPerHour,
      inQuietHours: this.inQuietHours(),
      activeGroups: this.groups.size,
      throttledTypes: this.alerts.size
    };
  }

  // Clear throttles
  clearThrottles() {
    this.alerts.clear();
    return { cleared: true };
  }
}

module.exports = new AlertThrottler();
