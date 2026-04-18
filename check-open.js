require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

sb.from('trades').select('*').eq('status','OPEN').then(({data,error}) => {
  if (error) return console.log('Error:', error.message);
  if (!data?.length) return console.log('No open positions');
  data.forEach(p => {
    const current = p.symbol === 'BTCUSDT' ? 72682 : 0;
    const pnl = p.side === 'LONG' ? (current - p.entry_price) * p.quantity : (p.entry_price - current) * p.quantity;
    console.log(`\n=== OPEN POSITION ===`);
    console.log(`Symbol:       ${p.symbol}`);
    console.log(`Side:         ${p.side}`);
    console.log(`Entry:        $${p.entry_price}`);
    console.log(`Stop Loss:    $${p.stop_loss}`);
    console.log(`Take Profit:  $${p.take_profit}`);
    console.log(`Quantity:     ${p.quantity}`);
    console.log(`Est. PnL:     $${pnl?.toFixed(2)}`);
    console.log(`Created:      ${p.created_at}`);
  });
}).catch(console.error);
