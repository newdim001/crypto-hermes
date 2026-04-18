require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

sb.from('trades').select('*').eq('symbol','BTCUSDT').order('created_at', {ascending: false}).limit(5).then(({data,error}) => {
  if (error) return console.log('Error:', error.message);
  data.forEach(p => {
    console.log(`\n=== BTCUSDT Trade ===`);
    console.log(`Status:     ${p.status}`);
    console.log(`Side:       ${p.side}`);
    console.log(`Entry:      $${p.entry_price}`);
    console.log(`TP:         $${p.take_profit}`);
    console.log(`SL:         $${p.stop_loss}`);
    console.log(`Closed PnL: $${p.pnl}`);
    console.log(`Date:       ${p.created_at}`);
  });
}).catch(console.error);
