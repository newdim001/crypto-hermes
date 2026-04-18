require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function closeTrade() {
  // Get current BTC price
  const priceRes = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const currentPrice = parseFloat(priceRes.data.price);
  console.log('Current BTC:', currentPrice);
  
  // Get the open BTCUSDT position
  const { data: positions, error } = await sb.from('trades')
    .select('*')
    .eq('symbol', 'BTCUSDT')
    .eq('status', 'OPEN');
  
  if (error) return console.log('Error:', error.message);
  if (!positions || positions.length === 0) return console.log('No open positions!');
  
  const pos = positions[0];
  const entry = parseFloat(pos.entry_price);
  const qty = parseFloat(pos.quantity);
  const pnl = (currentPrice - entry) * qty;
  
  console.log('\n=== CLOSING POSITION ===');
  console.log('Entry:   ', entry);
  console.log('Current: ', currentPrice);
  console.log('Qty:     ', qty);
  console.log('PnL:     ', pnl.toFixed(2));
  
  // Update to close (only use existing columns)
  const { error: updateError } = await sb.from('trades').update({
    status: 'CLOSED',
    exit_price: currentPrice,
    pnl: pnl
  }).eq('id', pos.id);
  
  if (updateError) {
    console.log('Error closing:', updateError.message);
  } else {
    console.log('\n✅ Position CLOSED! Profit banked: $' + pnl.toFixed(2));
  }
}

closeTrade().catch(console.error);
