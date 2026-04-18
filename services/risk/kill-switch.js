/**
 * Kill Switch - Emergency halt mechanism
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../data/state.json');
const KILL_FILE = path.join(__dirname, '../../data/kill-switch.json');

class KillSwitch {
  constructor() {
    this.active = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(KILL_FILE)) {
        const d = JSON.parse(fs.readFileSync(KILL_FILE, 'utf8'));
        this.active = d.active || false;
      }
    } catch (_) {}
  }

  activate(reason = 'Manual') {
    this.active = true;
    const data = { active: true, reason, activatedAt: new Date().toISOString() };
    fs.writeFileSync(KILL_FILE, JSON.stringify(data, null, 2));

    // Update state
    try {
      let state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state.halted = true;
      state.haltReason = reason;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (_) {}

    console.log(`🛑 KILL SWITCH ACTIVATED: ${reason}`);
    return true;
  }

  deactivate() {
    this.active = false;
    if (fs.existsSync(KILL_FILE)) fs.unlinkSync(KILL_FILE);
    try {
      let state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state.halted = false;
      delete state.haltReason;
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (_) {}
    console.log('✅ Kill switch deactivated');
    return true;
  }

  isActive() {
    this.load();
    return this.active;
  }

  halt(reason) {
    return this.activate(reason);
  }

  shouldHalt() {
    return this.isActive();
  }
}

module.exports = new KillSwitch();

// Named exports for kill-switch-test compatibility
async function triggerKillSwitch(mode, reason) {
  const ks = module.exports;
  ks.activate(reason || mode);
  return { triggered: true, mode, reason };
}

module.exports.triggerKillSwitch = triggerKillSwitch;
