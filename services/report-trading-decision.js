#!/usr/bin/env node
/**
 * Trading Decision Reporter
 * Shows both raw signals AND AI's final decision
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runPythonBot() {
  console.log('🤖 Running Python Trading Bot...');
  try {
    const { stdout } = await execAsync('python3.11 ~/.openclaw/workspace/crypto-trading-bot/run.py --cycle');
    return stdout;
  } catch (error) {
    console.log('Python bot error:', error.message);
    return null;
  }
}

async function runAIEngine() {
  console.log('\n🧠 Running AI Trading Engine...');
  try {
    const { stdout } = await execAsync('cd ~/.openclaw/workspace/crypto-edge && node services/trading-engine.js', {
      timeout: 30000
    });
    return stdout;
  } catch (error) {
    console.log('AI engine error:', error.message);
    if (error.stdout) return error.stdout;
    return null;
  }
}

function extractPythonSignals(output) {
  if (!output) return [];
  
  const signals = [];
  const lines = output.split('\n');
  let inSignals = false;
  
  for (const line of lines) {
    if (line.includes('Generated') && line.includes('signals:')) {
      inSignals = true;
      continue;
    }
    
    if (inSignals && line.trim().startsWith('✅')) {
      // Parse signal line like: "  BUY BTCUSDT @ $74335.54"
      const match = line.match(/\s*(BUY|SELL)\s+(\w+)\s+@\s+\$([\d,.]+)/);
      if (match) {
        signals.push({
          side: match[1],
          symbol: match[2],
          price: parseFloat(match[3].replace(',', '')),
          source: 'Python Bot'
        });
      }
    }
    
    if (inSignals && line.includes('Quality:')) {
      // Parse quality line
      const qualityMatch = line.match(/Quality:\s+([\d.]+)/);
      const regimeMatch = line.match(/Regime:\s+(\w+)/);
      if (qualityMatch && signals.length > 0) {
        signals[signals.length - 1].quality = parseFloat(qualityMatch[1]);
        if (regimeMatch) signals[signals.length - 1].regime = regimeMatch[1];
      }
    }
  }
  
  return signals;
}

function extractAIDecision(output) {
  if (!output) return { decision: 'ERROR', reason: 'No output' };
  
  const lines = output.split('\n');
  let aiDecision = null;
  let aiReason = null;
  let symbol = null;
  
  for (const line of lines) {
    // Look for AI decision lines
    if (line.includes('🧠 AI:')) {
      aiDecision = line.match(/🧠 AI:\s+(\w+)/)?.[1] || 'UNKNOWN';
      aiReason = line.substring(line.indexOf('-') + 1).trim();
    }
    
    // Look for symbol and RSI
    if (line.includes('RSI:')) {
      const symbolMatch = line.match(/(\w+):/);
      if (symbolMatch) symbol = symbolMatch[1];
    }
  }
  
  return {
    decision: aiDecision || 'NO_AI_DECISION',
    reason: aiReason || 'No AI analysis found',
    symbol: symbol || 'UNKNOWN'
  };
}

async function main() {
  console.log('═'.repeat(50));
  console.log('📊 TRADING DECISION REPORT');
  console.log('═'.repeat(50));
  
  // Run Python bot for raw signals
  const pythonOutput = await runPythonBot();
  const rawSignals = extractPythonSignals(pythonOutput);
  
  // Run AI engine for final decision
  const aiOutput = await runAIEngine();
  const aiDecision = extractAIDecision(aiOutput);
  
  console.log('\n📈 RAW SIGNALS FROM PYTHON BOT:');
  if (rawSignals.length > 0) {
    rawSignals.forEach((sig, i) => {
      console.log(`  ${i+1}. ${sig.side} ${sig.symbol} @ $${sig.price.toFixed(2)}`);
      console.log(`     Quality: ${sig.quality || 'N/A'} | Regime: ${sig.regime || 'N/A'}`);
    });
  } else {
    console.log('  ⚠️ No raw signals generated');
  }
  
  console.log('\n🧠 AI FINAL DECISION:');
  console.log(`  Symbol: ${aiDecision.symbol}`);
  console.log(`  Decision: ${aiDecision.decision}`);
  console.log(`  Reason: ${aiDecision.reason}`);
  
  console.log('\n🎯 FINAL ACTION:');
  if (aiDecision.decision === 'HOLD' && rawSignals.length > 0) {
    console.log('  ⚠️ AI OVERRIDE: HOLD (ignoring raw signals)');
    console.log(`  Reason: ${aiDecision.reason.substring(0, 100)}...`);
  } else if (aiDecision.decision === 'BUY' || aiDecision.decision === 'SELL') {
    console.log(`  ✅ FOLLOWING AI: ${aiDecision.decision}`);
  } else if (rawSignals.length > 0) {
    console.log(`  ⚠️ No AI decision - using raw signals`);
  } else {
    console.log('  ⏸️ No action - no signals or AI says HOLD');
  }
  
  console.log('\n' + '═'.repeat(50));
}

main().catch(console.error);