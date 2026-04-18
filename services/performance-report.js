// CryptoEdge Performance Report - Using Supabase
// Daily summary at 9 PM

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ymhidndhdvbtlfmtafbj.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_KEY_HERE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function generateReport() {
  console.log('📈 Generating performance report...');
  
  // FIX: Read balance from local state.json
  let currentBalance = 10000;
  try {
    const fs = require('fs'), path = require('path');
    const state = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/state.json'), 'utf8'));
    if (state.balance && state.balance > 0) currentBalance = state.balance;
  } catch(_) {}
  
  // Get today's trades
  const today = new Date().toISOString().split('T')[0];
  const { data: trades } = await supabase
    .from('trades')
    .select('*')
    .gte('created_at', today);
  
  // Calculate metrics
  const wins = trades?.filter(t => parseFloat(t.pnl) > 0).length || 0;
  const losses = trades?.filter(t => parseFloat(t.pnl) < 0).length || 0;
  const totalPnL = trades?.reduce((sum, t) => sum + (parseFloat(t.pnl) || 0), 0) || 0;
  const winRate = trades?.length ? (wins / trades.length * 100).toFixed(1) : 0;
  
  // Get all-time stats
  const { data: allTrades } = await supabase
    .from('trades')
    .select('*');
  
  const totalTrades = allTrades?.length || 0;
  const totalWins = allTrades?.filter(t => parseFloat(t.pnl) > 0).length || 0;
  
  const report = `
📊 **CryptoEdge Daily Report**

💰 **Balance:** $${currentBalance.toFixed(2)}
📈 **Today's P&L:** $${totalPnL.toFixed(2)}
📊 **Trades Today:** ${trades?.length || 0}
✅ **Wins:** ${wins} | ❌ **Losses:** ${losses}
🎯 **Win Rate:** ${winRate}%

📊 **All-Time:** ${totalTrades} trades, ${totalWins} wins

🤖 Paper Trading - Testnet
  `.trim();
  
  // Send to Telegram
  try {
    const axios = require('axios');
    await axios.post(`https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage`, {
      chat_id: '8169173316',
      text: report,
      parse_mode: 'Markdown'
    });
    console.log(report);
    console.log('\n✅ Report sent to Telegram');
  } catch (e) {
    console.log('Telegram error:', e.message);
    console.log(report);
  }
}

if (require.main === module) {
  generateReport()
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Error:', e.message);
      process.exit(1);
    });
}

module.exports = { generateReport };
