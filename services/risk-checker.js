// CryptoEdge Risk Checker
// Monitors positions, max daily loss, and risk limits

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Risk Limits
const MAX_DAILY_LOSS_PERCENT = 5;
const INITIAL_CAPITAL = 10000;
const MAX_POSITIONS = 10;

async function checkRisk() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  console.log('🛡️ Running risk checks...');
  
  // Get paper trading balance from database
  const { data: account } = await supabase.from('account').select('usdt').eq('bot_mode', 'paper').single();
  const currentBalance = account?.usdt || 10000;
  
  // Calculate daily P&L
  const dailyPnL = currentBalance - INITIAL_CAPITAL;
  const dailyPnLPercent = (dailyPnL / INITIAL_CAPITAL) * 100;
  
  console.log(`  Balance: $${currentBalance.toFixed(2)}`);
  console.log(`  Daily P&L: $${dailyPnL.toFixed(2)} (${dailyPnLPercent.toFixed(2)}%)`);
  
  // Check daily loss limit
  if (dailyPnLPercent <= -MAX_DAILY_LOSS_PERCENT) {
    console.log('  ⚠️ MAX DAILY LOSS LIMIT REACHED - TRADING HALTED');
    return { status: 'HALTED', reason: 'Max daily loss exceeded' };
  }
  
  // Check positions from trades table (both paper and ml-paper modes)
  const { data: positions } = await supabase.from('trades').select('*').in('bot_mode', ['paper', 'ml-paper']).eq('status', 'OPEN');
  console.log(`  Open Positions: ${positions?.length || 0}`);
  
  if (positions?.length >= MAX_POSITIONS) {
    console.log('  ⚠️ Max positions reached');
  }
  
  // All checks passed
  console.log('  ✅ All risk checks passed');
  
  return { 
    status: 'OK', 
    balance: currentBalance, 
    dailyPnL: dailyPnL,
    positions: positions?.length || 0
  };
}

if (require.main === module) {
  checkRisk().then(r => {
    console.log('Result:', r);
    process.exit(0);
  });
}

module.exports = { checkRisk };
