/**
 * Auto Trainer v2
 * Automatically retrains ML model on a schedule
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

// Training configuration
const CONFIG = {
  // Schedule: 'daily', 'weekly', or 'on-demand'
  schedule: 'weekly',
  
  // Day of week for weekly training (0=Sunday, 6=Saturday)
  trainingDay: 0, // Sunday
  
  // Time of day for training (24h format)
  trainingHour: 3, // 3 AM
  
  // Minimum interval between retraining (hours)
  minInterval: 24,
  
  // Conditions for auto-retraining
  minTradesBeforeRetrain: 50,
  minDataPoints: 1000,
  
  // Performance thresholds
  accuracyDropThreshold: 5, // Retrain if accuracy drops by 5%
  maxDaysWithoutTrain: 7 // Force retrain if >7 days
};

/**
 * Check if model needs retraining
 */
async function checkRetraining() {
  const state = loadState();
  const lastTrained = state.lastTrained ? new Date(state.lastTrained) : null;
  const now = new Date();
  
  // Check if forced retrain needed
  if (!lastTrained) {
    console.log('📊 Model never trained - training now');
    return { shouldTrain: true, reason: 'Never trained' };
  }
  
  const daysSinceTrain = (now - lastTrained) / (1000 * 60 * 60 * 24);
  
  // Force retrain if too old
  if (daysSinceTrain > CONFIG.maxDaysWithoutTrain) {
    console.log(`📊 Model ${daysSinceTrain.toFixed(1)} days old - training now`);
    return { shouldTrain: true, reason: `Model ${daysSinceTrain.toFixed(1)} days old` };
  }
  
  // Check accuracy drop
  const accuracy = getCurrentAccuracy();
  const previousAccuracy = state.lastAccuracy || 0;
  
  if (previousAccuracy > 0 && accuracy < previousAccuracy - CONFIG.accuracyDropThreshold) {
    console.log(`📊 Accuracy dropped from ${previousAccuracy}% to ${accuracy}% - training now`);
    return { shouldTrain: true, reason: `Accuracy dropped ${(previousAccuracy - accuracy).toFixed(1)}%` };
  }
  
  // Check trade count
  const trades = loadTrades();
  if (trades.length >= CONFIG.minTradesBeforeRetrain) {
    const tradesSinceTrain = trades.filter(t => 
      lastTrained && new Date(t.exitTime) > lastTrained
    ).length;
    
    if (tradesSinceTrain >= CONFIG.minTradesBeforeRetrain) {
      console.log(`📊 ${tradesSinceTrain} new trades since last train - training now`);
      return { shouldTrain: true, reason: `${tradesSinceTrain} new trades` };
    }
  }
  
  // Check if scheduled time
  if (CONFIG.schedule === 'daily' && now.getHours() === CONFIG.trainingHour) {
    return { shouldTrain: true, reason: 'Daily schedule' };
  }
  
  if (CONFIG.schedule === 'weekly' && 
      now.getDay() === CONFIG.trainingDay && 
      now.getHours() === CONFIG.trainingHour) {
    return { shouldTrain: true, reason: 'Weekly schedule (Sunday)' };
  }
  
  return { 
    shouldTrain: false, 
    reason: `Next scheduled: ${getNextTrainingTime()}`,
    lastTrained: lastTrained?.toISOString(),
    daysSinceTrain: daysSinceTrain.toFixed(1),
    currentAccuracy: accuracy
  };
}

/**
 * Run model training
 */
async function runTraining() {
  console.log('🚀 Starting auto-training...');
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Run the trainer
    const trainer = spawn('node', ['services/ml/ml-trainer-v3.js'], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'inherit'
    });
    
    trainer.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      
      if (code === 0) {
        // Update state
        updateTrainingState({
          lastTrained: new Date().toISOString(),
          lastDuration: parseFloat(duration),
          status: 'success'
        });
        
        console.log(`✅ Training complete in ${duration} minutes`);
        resolve({ success: true, duration });
      } else {
        updateTrainingState({
          lastTrained: new Date().toISOString(),
          lastStatus: 'failed',
          lastError: `Exit code ${code}`
        });
        
        console.log(`❌ Training failed with code ${code}`);
        reject(new Error(`Training failed with code ${code}`));
      }
    });
    
    trainer.on('error', (err) => {
      updateTrainingState({
        lastTrained: new Date().toISOString(),
        lastStatus: 'error',
        lastError: err.message
      });
      
      reject(err);
    });
  });
}

/**
 * Get current model accuracy
 */
function getCurrentAccuracy() {
  try {
    const modelPath = path.join(DATA_DIR, 'ml-model.json');
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    return (model.accuracy * 100) || 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Load trades
 */
function loadTrades() {
  try {
    const journalPath = path.join(DATA_DIR, 'trading-journal.json');
    return JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

/**
 * Load state
 */
function loadState() {
  try {
    const statePath = path.join(DATA_DIR, 'training-state.json');
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

/**
 * Update training state
 */
function updateTrainingState(updates) {
  const state = loadState();
  Object.assign(state, updates);
  
  // Add to history
  if (!state.history) state.history = [];
  state.history.push({
    timestamp: new Date().toISOString(),
    ...updates
  });
  
  // Keep only last 10 entries
  if (state.history.length > 10) {
    state.history = state.history.slice(-10);
  }
  
  const statePath = path.join(DATA_DIR, 'training-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Get next training time
 */
function getNextTrainingTime() {
  const now = new Date();
  
  if (CONFIG.schedule === 'daily') {
    const next = new Date(now);
    next.setHours(CONFIG.trainingHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  
  if (CONFIG.schedule === 'weekly') {
    const next = new Date(now);
    next.setHours(CONFIG.trainingHour, 0, 0, 0);
    
    const daysUntilTraining = (CONFIG.trainingDay - now.getDay() + 7) % 7;
    if (daysUntilTraining === 0 && now.getHours() >= CONFIG.trainingHour) {
      daysUntilTraining = 7;
    }
    
    next.setDate(next.getDate() + daysUntilTraining);
    return next.toISOString();
  }
  
  return 'On-demand only';
}

/**
 * Run scheduled check and training
 */
async function runScheduledCheck() {
  console.log('🔍 Checking if retraining needed...');
  
  const check = await checkRetraining();
  console.log(`   Should train: ${check.shouldTrain ? 'YES' : 'NO'}`);
  console.log(`   Reason: ${check.reason}`);
  
  if (check.shouldTrain) {
    try {
      await runTraining();
      return { success: true, check };
    } catch (err) {
      return { success: false, check, error: err.message };
    }
  }
  
  return { success: true, check, trained: false };
}

/**
 * Print training status
 */
function printStatus() {
  const state = loadState();
  const check = {
    lastTrained: state.lastTrained,
    currentAccuracy: getCurrentAccuracy(),
    daysSinceTrain: state.lastTrained ? 
      ((Date.now() - new Date(state.lastTrained)) / (1000 * 60 * 60 * 24)).toFixed(1) : 'Never'
  };
  
  console.log('\n📊 MODEL TRAINING STATUS');
  console.log('═══════════════════════════════════════');
  console.log(`Last Trained: ${check.lastTrained || 'Never'}`);
  console.log(`Days Since Train: ${check.daysSinceTrain}`);
  console.log(`Current Accuracy: ${check.currentAccuracy.toFixed(1)}%`);
  console.log(`Schedule: ${CONFIG.schedule}`);
  console.log(`Next Scheduled: ${getNextTrainingTime()}`);
  console.log(`Training History: ${state.history?.length || 0} runs`);
  console.log('═══════════════════════════════════════\n');
}

// CLI mode
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'check') {
    // Just check
    checkRetraining().then(check => {
      console.log(check);
      process.exit(0);
    });
  } else if (args[0] === 'train') {
    // Force train
    runTraining().then(() => process.exit(0)).catch(() => process.exit(1));
  } else if (args[0] === 'status') {
    // Print status
    printStatus();
  } else {
    // Run scheduled check
    runScheduledCheck()
      .then(result => {
        if (result.trained === false) {
          console.log('✅ No training needed');
        }
        process.exit(0);
      })
      .catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
      });
  }
}

module.exports = {
  CONFIG,
  checkRetraining,
  runTraining,
  runScheduledCheck,
  printStatus
};
