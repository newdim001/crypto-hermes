require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

sb.from('trades').select('*').neq('status','closed').limit(10).then(({data,error}) => {
  if (error) { console.log('Error:', error.message); return; }
  if (!data || data.length === 0) { console.log('No open positions'); return; }
  data.forEach(p => {
    console.log('=====');
    console.log('Symbol:', p.symbol);
    console.log('Side:', p.side);
    console.log('Entry:', p.entry_price);
    console.log('Stop Loss:', p.stop_loss);
    console.log('Take Profit:', p.take_profit);
    console.log('Status:', p.status);
    console.log('PnL:', p.pnl);
  });
}).catch(e => console.error(e));
