/**
 * Historical Data Collector
 * Collects OHLCV data for backtesting and ML training
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BINANCE_BASE = 'https://api.binance.com/api/v3';
const DATA_DIR = path.join(__dirname, '../../data/market');

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT'];
const INTERVALS = ['1m', '15m', '1h', '4h', '1d'];
const DAYS_BACK = 365; // 1 year of data

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function fetchKlines(symbol, interval, startTime, endTime, limit = 1000) {
  const url = `${BINANCE_BASE}/klines`;
  const params = {
    symbol,
    interval,
    startTime,
    endTime,
    limit,
  };
  
  try {
    const response = await axios.get(url, { params });
    return response.data.map(k => ({
      time: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
      quoteVolume: parseFloat(k[7]),
      trades: k[8],
      takerBuyBaseVolume: parseFloat(k[9]),
      takerBuyQuoteVolume: parseFloat(k[10]),
    }));
  } catch (err) {
    console.error(`Error fetching ${symbol} ${interval}:`, err.message);
    return [];
  }
}

async function collectAllData() {
  console.log('📊 Starting Historical Data Collection');
  console.log('='.repeat(50));
  
  const endTime = Date.now();
  const startTime = endTime - (DAYS_BACK * 24 * 60 * 60 * 1000);
  
  for (const symbol of SYMBOLS) {
    console.log(`\n📈 Collecting ${symbol}...`);
    
    for (const interval of INTERVALS) {
      console.log(`  ${interval}...`);
      
      // Collect in batches (max 1000 candles per request)
      const filePath = path.join(DATA_DIR, `${symbol}_${interval}.json`);
      let allData = [];
      
      let batchStart = startTime;
      let batches = 0;
      const maxBatches = 100; // Safety limit
      
      while (batchStart < endTime && batches < maxBatches) {
        const batchEnd = Math.min(batchStart + (90 * 24 * 60 * 60 * 1000), endTime); // 90 days per batch
        
        const data = await fetchKlines(symbol, interval, batchStart, batchEnd);
        
        if (data.length === 0) break;
        
        allData = [...allData, ...data];
        batchStart = data[data.length - 1].time + 1;
        batches++;
        
        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      }
      
      // Save to file
      fs.writeFileSync(filePath, JSON.stringify({
        symbol,
        interval,
        count: allData.length,
        startTime: allData[0]?.time,
        endTime: allData[allData.length - 1]?.time,
        data: allData,
      }, null, 2));
      
      console.log(`    ✅ ${allData.length} candles saved`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Data collection complete!');
  
  // Summary
  let totalCandles = 0;
  SYMBOLS.forEach(symbol => {
    INTERVALS.forEach(interval => {
      const file = path.join(DATA_DIR, `${symbol}_${interval}.json`);
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file));
        totalCandles += data.count;
      }
    });
  });
  
  console.log(`Total: ${totalCandles.toLocaleString()} candles collected`);
}

async function loadData(symbol, interval) {
  const filePath = path.join(DATA_DIR, `${symbol}_${interval}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath));
    return data.data;
  }
  return null;
}

// CLI
if (require.main === module) {
  collectAllData().then(() => {
    console.log('\n📁 Data saved to:', DATA_DIR);
  }).catch(err => {
    console.error('Error:', err);
  });
}

module.exports = { collectAllData, loadData, DATA_DIR };
