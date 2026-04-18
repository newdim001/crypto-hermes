require('dotenv').config({ path: '/Users/suren/.openclaw/workspace/crypto-edge/.env' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  // Get BTC current price
  const axios = require('axios');
  const priceRes = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const currentPrice = parseFloat(priceRes.data.price);
  console.log('Current BTC:', currentPrice);
  
  // Get BTCUSDT open position
  const { data: positions } = await sb.from('trades').select('*').eq('symbol', 'BTCUSDT').eq('status', 'OPEN');
  
  if (!positions || positions.length === 0) {
    console.log('No open BTCUSDT position');
    return;
  }
  
  const p = positions[0];
  const entry = parseFloat(p.entry_price);
  const qty = parseFloat(p.quantity);
  const tp = parseFloat(p.take_profit);
  
  const pnl = (currentPrice - entry) * qty;
  const tpDistance = ((tp - entry) / entry * 100).toFixed(2);
  const profitToTP = tp - currentPrice;
  
  console.log('\n=== Position Details ===');
  console.log('Entry:     ', entry);
  console.log('Current:   ', currentPrice);
  console.log('Quantity:  ', qty);
  console.log('TP:        ', tp, '(' + tpDistance + '% away)');
  console.log('PnL:       ', pnl.toFixed(2), '(' + (pnl / entry * 100).toFixed(2) + '%)');
  console.log('Profit to TP:', profitToTP.toFixed(2));
  
  if (currentPrice >= tp) {
    console.log('\n🚨 TP HIT! Should close position!');
    console.log('Closing at:', currentPrice);
    console.log('Profit:   ', pnl.toFixed(2));
    
    // Close the position
    await sb.from('trades').update({
      status: 'CLOSED',
      closed_at: new Date().toISOString(),
      exit_price: currentPrice,
      pnl: pnl,
      take_profit: null
    }).eq('id', p.id);
    
    console.log('✅ Position closed!');
  } else {
    console.log('\n⏳ TP not yet hit, need', profitToTP.toFixed(2), 'more');
  }
}

check().catch(console.error);
