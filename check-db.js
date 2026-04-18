require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  // Check account table
  const { data: acct, error: acctErr } = await sb.from('account').select('*').limit(5);
  console.log('Account table:', acctErr ? 'ERROR: ' + acctErr.message : JSON.stringify(acct));

  // Count open trades
  const { data: open, error: openErr } = await sb.from('trades').select('*').eq('status', 'OPEN');
  console.log('Open trades:', openErr ? 'ERROR: ' + openErr.message : (open?.length || 0));

  // Count total trades
  const { count } = await sb.from('trades').select('*', {count: 'exact', head: true});
  console.log('Total trades in DB:', count);
}

check().catch(console.error);
