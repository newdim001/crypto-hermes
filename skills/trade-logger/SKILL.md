# SKILL: Trade Logger

## Purpose
Record all trades to database for analysis and audit trail.

## Database Schema

### trades table
```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY,
  bot_mode TEXT, -- 'paper' or 'live'
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'LONG' or 'SHORT'
  entry_price DECIMAL,
  exit_price DECIMAL,
  quantity DECIMAL,
  entry_time TIMESTAMP,
  exit_time TIMESTAMP,
  pnl DECIMAL,
  pnl_percent DECIMAL,
  status TEXT, -- 'OPEN', 'CLOSED'
  signal_source TEXT, -- 'AI', 'MANUAL', 'BACKTEST'
  confidence INTEGER,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  fees DECIMAL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### positions table
```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price DECIMAL NOT NULL,
  quantity DECIMAL NOT NULL,
  current_price DECIMAL,
  unrealized_pnl DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  opened_at TIMESTAMP DEFAULT NOW()
);
```

### performance table
```sql
CREATE TABLE performance (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  bot_mode TEXT,
  starting_balance DECIMAL,
  ending_balance DECIMAL,
  daily_pnl DECIMAL,
  daily_pnl_percent DECIMAL,
  trades_count INTEGER,
  wins INTEGER,
  losses INTEGER,
  win_rate DECIMAL
);
```

## Metrics Tracked
- Total P&L
- Win rate
- Average win/loss
- Sharpe ratio
- Max drawdown
- Trade frequency
- Best/worst trades

## Usage
```javascript
// Log new trade
await logTrade({
  symbol: 'BTCUSDT',
  side: 'LONG',
  entryPrice: 43000,
  quantity: 0.1,
  signal: signal
})

// Close trade
await closeTrade(tradeId, exitPrice)

// Get performance
const stats = await getPerformanceStats('paper', '2024-02-01')
```

## Used By
- paper-trader
- live-trader
- backtester
