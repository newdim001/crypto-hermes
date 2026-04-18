/**
 * Latency Monitoring Service
 * Real-time monitoring of data and execution latency
 */

const fs = require('fs');
const path = require('path');

class LatencyMonitor {
  constructor(config = {}) {
    this.dataAlertThreshold = config.dataAlertThreshold || 500; // ms
    this.executionAlertThreshold = config.executionAlertThreshold || 2000; // ms
    this.pauseThreshold = config.pauseThreshold || 5000; // ms - pause trading
    this.logFile = config.logFile || path.join(__dirname, '../../logs/latency.json');
    this.alerts = [];
    
    this.ensureLogFile();
  }

  ensureLogFile() {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, JSON.stringify({ readings: [] }));
    }
  }

  // Record data fetch latency
  recordDataLatency(source, latencyMs) {
    const reading = {
      type: 'data',
      source,
      latency: latencyMs,
      timestamp: new Date().toISOString(),
    };
    
    this.logReading(reading);
    
    if (latencyMs > this.dataAlertThreshold) {
      this.sendAlert('DATA_LATENCY', `Data from ${source} took ${latencyMs}ms (threshold: ${this.dataAlertThreshold}ms)`, latencyMs);
    }
    
    return reading;
  }

  // Record order execution latency
  recordExecutionLatency(orderType, latencyMs) {
    const reading = {
      type: 'execution',
      orderType,
      latency: latencyMs,
      timestamp: new Date().toISOString(),
    };
    
    this.logReading(reading);
    
    if (latencyMs > this.executionAlertThreshold) {
      this.sendAlert('EXECUTION_LATENCY', `Order ${orderType} took ${latencyMs}ms (threshold: ${this.executionAlertThreshold}ms)`, latencyMs);
    }
    
    if (latencyMs > this.pauseThreshold) {
      this.sendAlert('CRITICAL_LATENCY', `Latency ${latencyMs}ms exceeds pause threshold - consider pausing`, latencyMs, true);
    }
    
    return reading;
  }

  // Record WebSocket latency
  recordWebSocketLatency(latencyMs) {
    const reading = {
      type: 'websocket',
      latency: latencyMs,
      timestamp: new Date().toISOString(),
    };
    
    this.logReading(reading);
    
    if (latencyMs > this.dataAlertThreshold) {
      this.sendAlert('WS_LATENCY', `WebSocket latency ${latencyMs}ms exceeds threshold`, latencyMs);
    }
    
    return reading;
  }

  // Log reading to file
  logReading(reading) {
    try {
      const data = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      data.readings.push(reading);
      
      // Keep last 1000 readings
      if (data.readings.length > 1000) {
        data.readings = data.readings.slice(-1000);
      }
      
      data.lastUpdate = new Date().toISOString();
      fs.writeFileSync(this.logFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to log latency:', err.message);
    }
  }

  // Send alert
  sendAlert(level, message, latency, critical = false) {
    const alert = {
      level: critical ? 'CRITICAL' : level,
      message,
      latency,
      timestamp: new Date().toISOString(),
    };
    
    this.alerts.push(alert);
    
    // Keep last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }
    
    console.log(`🚨 [${alert.level}] ${message}`);
    
    // Could integrate with Telegram/Slack here
    return alert;
  }

  // Get statistics
  getStats(hours = 24) {
    try {
      const data = JSON.parse(fs.readFileSync(this.logFile, 'utf8'));
      const cutoff = Date.now() - (hours * 60 * 60 * 1000);
      
      const recentReadings = data.readings.filter(r => new Date(r.timestamp).getTime() > cutoff);
      
      const dataReadings = recentReadings.filter(r => r.type === 'data').map(r => r.latency);
      const execReadings = recentReadings.filter(r => r.type === 'execution').map(r => r.latency);
      const wsReadings = recentReadings.filter(r => r.type === 'websocket').map(r => r.latency);
      
      const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const max = arr => arr.length ? Math.max(...arr) : 0;
      const min = arr => arr.length ? Math.min(...arr) : 0;
      
      return {
        period: `${hours}h`,
        readings: recentReadings.length,
        data: {
          count: dataReadings.length,
          avg: avg(dataReadings).toFixed(0),
          max: max(dataReadings),
          min: min(dataReadings),
        },
        execution: {
          count: execReadings.length,
          avg: avg(execReadings).toFixed(0),
          max: max(execReadings),
          min: min(execReadings),
        },
        websocket: {
          count: wsReadings.length,
          avg: avg(wsReadings).toFixed(0),
          max: max(wsReadings),
          min: min(wsReadings),
        },
        alerts: this.alerts.slice(-10),
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  // Check if should pause trading
  shouldPauseTrading() {
    const recent = this.getStats(1);
    
    if (recent.error) return false;
    
    const maxData = parseInt(recent.data.max) || 0;
    const maxExec = parseInt(recent.execution.max) || 0;
    const maxWs = parseInt(recent.websocket.max) || 0;
    
    return maxData > this.pauseThreshold || 
           maxExec > this.pauseThreshold || 
           maxWs > this.pauseThreshold;
  }

  // Get status summary
  getStatus() {
    const stats = this.getStats(1);
    const paused = this.shouldPauseTrading();
    
    return {
      status: paused ? '⏸️ PAUSED' : '✅ RUNNING',
      shouldPause: paused,
      latestDataLatency: stats.data.max,
      latestExecLatency: stats.execution.max,
      alertCount: this.alerts.length,
      thresholds: {
        data: this.dataAlertThreshold,
        execution: this.executionAlertThreshold,
        pause: this.pauseThreshold,
      },
    };
  }

  // Clear alerts
  clearAlerts() {
    this.alerts = [];
    console.log('✅ Alerts cleared');
  }
}

// CLI
if (require.main === module) {
  const monitor = new LatencyMonitor();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'status':
      console.log('\n📊 Latency Status:\n', JSON.stringify(monitor.getStatus(), null, 2));
      break;
    case 'stats':
      console.log('\n📈 Latency Stats (24h):\n', JSON.stringify(monitor.getStats(24), null, 2));
      break;
    case 'clear':
      monitor.clearAlerts();
      break;
    case 'test':
      // Simulate some latency readings
      monitor.recordDataLatency('binance', Math.random() * 800);
      monitor.recordExecutionLatency('market', Math.random() * 3000);
      monitor.recordWebSocketLatency(Math.random() * 400);
      console.log('✅ Test readings recorded');
      break;
    default:
      console.log('Usage: node latency-monitor.js [status|stats|clear|test]');
  }
}

module.exports = { LatencyMonitor };
