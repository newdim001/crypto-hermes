require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

sb.from('trades').select('id, symbol, status, entry_price, take_profit, pnl').eq('symbol','BTCUSDT').order('created_at', {ascending:false}).limit(3).then(({data,error}) => {
  if (error) return console.log('Error:', error.message);
  data.forEach(p => console.log(JSON.stringify(p)));
}).catch(console.error);
