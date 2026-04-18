// CryptoEdge Data Collector
// Collects price data every minute and stores in Supabase

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'POLUSDT'];

async function collectData() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  console.log('📊 Collecting market data...');
  
  for (const symbol of SYMBOLS) {
    try {
      // Using MAINNET prices for learning (but trading on testnet)
      const r = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);
      const data = r.data;
      
      await supabase.from('market_data').insert({
        symbol: symbol,
        interval: '1m',
        open_time: new Date().toISOString(),
        open: data.openPrice,
        high: data.highPrice,
        low: data.lowPrice,
        close: data.lastPrice,
        volume: data.volume,
        quote_volume: data.quoteVolume,
        trades: data.count
      });
      
      console.log(`  ✅ ${symbol}: $${data.lastPrice}`);
    } catch (e) {
      console.log(`  ❌ ${symbol}: ${e.message}`);
    }
  }
  
  console.log('📊 Data collection complete');
}

if (require.main === module) {
  collectData().then(() => process.exit(0));
}

module.exports = { collectData };
