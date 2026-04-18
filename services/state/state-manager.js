// CryptoEdge State Management
// Persistent state with crash recovery

const fs = require('fs');
const path = require('path');

class StateManager {
  constructor() {
    this.statePath = path.join(__dirname, '../../data/state.json');
    this.backupPath = path.join(__dirname, '../../data/state.backup.json');
    this.state = {};
    this.autoSaveInterval = 30000; // 30 seconds
    this.lastSave = 0;
  }

  // Initialize state
  init() {
    try {
      // Try primary state file
      if (fs.existsSync(this.statePath)) {
        this.state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        return { loaded: 'primary', entries: Object.keys(this.state).length };
      }
      
      // Try backup
      if (fs.existsSync(this.backupPath)) {
        this.state = JSON.parse(fs.readFileSync(this.backupPath, 'utf8'));
        return { loaded: 'backup', entries: Object.keys(this.state).length };
      }
      
      // Fresh start
      this.state = { initialized: Date.now() };
      return { loaded: 'new', entries: 0 };
    } catch (e) {
      this.state = { initialized: Date.now(), recoveryError: e.message };
      return { loaded: 'error', error: e.message };
    }
  }

  // Save state
  save() {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      
      // Backup current before overwrite
      if (fs.existsSync(this.statePath)) {
        fs.copyFileSync(this.statePath, this.backupPath);
      }
      
      this.state.lastSaved = Date.now();
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
      this.lastSave = Date.now();
      
      return { saved: true, timestamp: this.lastSave };
    } catch (e) {
      return { saved: false, error: e.message };
    }
  }

  // Get state value
  get(key) {
    return this.state[key];
  }

  // Set state value
  set(key, value) {
    this.state[key] = value;
    
    // Auto-save if interval passed
    if (Date.now() - this.lastSave > this.autoSaveInterval) {
      this.save();
    }
    
    return { set: key, value };
  }

  // Get all state
  getAll() {
    return { ...this.state };
  }

  // Clear state (with backup)
  clear() {
    this.save(); // Backup first
    this.state = { cleared: Date.now() };
    return { cleared: true };
  }

  // Snapshot for crash recovery
  snapshot() {
    return {
      timestamp: Date.now(),
      state: { ...this.state },
      checksum: this.calculateChecksum()
    };
  }

  // Calculate checksum
  calculateChecksum() {
    const str = JSON.stringify(this.state);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }
}

module.exports = new StateManager();
