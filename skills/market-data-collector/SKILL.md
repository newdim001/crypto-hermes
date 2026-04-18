# SKILL: Market Data Collector

## Purpose
Collect and store historical market data for analysis and backtesting.

## Capabilities
- Fetch OHLCV (Open, High, Low, Close, Volume) data
- Collect order book data
- Gather funding rates
- Track liquidations
- Store data in Supabase

## Data Points Collected
- Price (OHLCV)
- Volume
- Trade count
- Taker buy/sell volume
- Funding rate (for perpetuals)
- Open interest (for perpetuals)

## Timeframes
- 1m, 5m, 15m, 1h, 4h, 1d, 1w

## Symbols to Monitor (Initial)
- BTCUSDT
- ETHUSDT
- BNBUSDT
- SOLUSDT
- XRPUSDT
- ADAUSDT
- DOGEUSDT
- AVAXUSDT
- DOTUSDT
- MATICUSDT

## Database Storage
- Table: `market_data`
- Columns: symbol, interval, open_time, open, high, low, close, volume, trades

## Usage
```javascript
// Collect last 100 candles for BTC
await collectKlines('BTCUSDT', '1h', 100)

// Collect multiple symbols
for (const symbol of WATCHLIST) {
  await collectKlines(symbol, '1h', 500)
}
```

## Used By
- technical-analyst
- backtester
- ai-signal-generator
