require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/kvantedge/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createSettings() {
  const { error } = await supabase.from('bot_settings').insert({
    bot_mode: 'paper',
    max_position_size: 10,
    risk_per_trade: 2,
    max_daily_loss: 5,
    max_daily_trades: 20,
    watchlist: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'POLUSDT'],
    active: true
  });

  if (error) console.log('Error:', error.message);
  else console.log('✅ bot_settings table created');
  
  process.exit(0);
}

createSettings();
