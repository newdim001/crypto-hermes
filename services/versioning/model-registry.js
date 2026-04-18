// CryptoEdge Model Versioning
// Model registry with rollback capability

const fs = require('fs');
const path = require('path');

class ModelRegistry {
  constructor() {
    this.registryPath = path.join(__dirname, '../../data/model-registry.json');
    this.modelsDir = path.join(__dirname, '../../models');
    this.registry = { models: [], currentVersion: null };
  }

  // Register new model version
  register(modelName, metrics, modelPath) {
    const version = {
      id: `v${Date.now()}`,
      name: modelName,
      timestamp: Date.now(),
      metrics: {
        accuracy: metrics.accuracy,
        sharpe: metrics.sharpe,
        maxDrawdown: metrics.maxDrawdown,
        winRate: metrics.winRate
      },
      path: modelPath,
      status: 'registered'
    };
    
    this.registry.models.push(version);
    this.save();
    
    return { registered: version.id, metrics };
  }

  // Promote model to production
  promote(versionId) {
    const model = this.registry.models.find(m => m.id === versionId);
    if (!model) return { error: 'Model not found' };
    
    // Demote current
    if (this.registry.currentVersion) {
      const current = this.registry.models.find(m => m.id === this.registry.currentVersion);
      if (current) current.status = 'archived';
    }
    
    model.status = 'production';
    this.registry.currentVersion = versionId;
    this.save();
    
    return { promoted: versionId };
  }

  // Rollback to previous version
  rollback() {
    const archived = this.registry.models
      .filter(m => m.status === 'archived')
      .sort((a, b) => b.timestamp - a.timestamp);
    
    if (archived.length === 0) {
      return { error: 'No previous version to rollback to' };
    }
    
    const previous = archived[0];
    return this.promote(previous.id);
  }

  // Get current model
  getCurrent() {
    if (!this.registry.currentVersion) return null;
    return this.registry.models.find(m => m.id === this.registry.currentVersion);
  }

  // List all versions
  list() {
    return this.registry.models.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      accuracy: m.metrics.accuracy,
      timestamp: new Date(m.timestamp).toISOString()
    }));
  }

  // Compare versions
  compare(v1, v2) {
    const m1 = this.registry.models.find(m => m.id === v1);
    const m2 = this.registry.models.find(m => m.id === v2);
    
    if (!m1 || !m2) return { error: 'Version not found' };
    
    return {
      v1: { id: v1, ...m1.metrics },
      v2: { id: v2, ...m2.metrics },
      winner: m1.metrics.sharpe > m2.metrics.sharpe ? v1 : v2
    };
  }

  // Save registry
  save() {
    try {
      const dir = path.dirname(this.registryPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2));
      return { saved: true };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Load registry
  load() {
    try {
      if (fs.existsSync(this.registryPath)) {
        this.registry = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
      }
      return { loaded: true, models: this.registry.models.length };
    } catch (e) {
      return { error: e.message };
    }
  }
}

module.exports = new ModelRegistry();
