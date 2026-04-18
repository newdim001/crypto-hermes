-- Trading Bot Database Schema
-- Run in Supabase SQL Editor

-- 1. Trades Table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_mode TEXT DEFAULT 'paper' CHECK (bot_mode IN ('paper', 'live')),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20, 8),
  exit_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8),
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  pnl DECIMAL(20, 8),
  pnl_percent DECIMAL(10, 4),
  status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  signal_source TEXT DEFAULT 'AI',
  confidence INTEGER,
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  fees DECIMAL(20, 8) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Open Positions
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_mode TEXT DEFAULT 'paper',
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
  entry_price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  confidence INTEGER,
  ml_score DECIMAL(10, 2),
  reasons TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  mode TEXT DEFAULT 'paper',
  exit_price DECIMAL(20, 8),
  pnl DECIMAL(20, 8),
  close_reason TEXT,
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Market Data Storage
CREATE TABLE IF NOT EXISTS market_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  open DECIMAL(20, 8),
  high DECIMAL(20, 8),
  low DECIMAL(20, 8),
  close DECIMAL(20, 8),
  volume DECIMAL(20, 8),
  quote_volume DECIMAL(20, 8),
  trades INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, interval, open_time)
);

-- 4. Trading Signals
CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'CLOSE', 'HOLD')),
  confidence INTEGER,
  entry_price DECIMAL(20, 8),
  stop_loss DECIMAL(20, 8),
  take_profit DECIMAL(20, 8),
  position_size DECIMAL(10, 4),
  risk_reward DECIMAL(10, 2),
  timeframe TEXT,
  reason TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'EXECUTED', 'EXPIRED', 'REJECTED')),
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Backtest Results
CREATE TABLE IF NOT EXISTS backtest_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_capital DECIMAL(20, 8),
  final_capital DECIMAL(20, 8),
  total_return DECIMAL(10, 4),
  sharpe_ratio DECIMAL(10, 4),
  max_drawdown DECIMAL(10, 4),
  win_rate DECIMAL(10, 4),
  total_trades INTEGER,
  winning_trades INTEGER,
  losing_trades INTEGER,
  avg_trade DECIMAL(20, 8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Performance Tracking
CREATE TABLE IF NOT EXISTS performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  bot_mode TEXT,
  starting_balance DECIMAL(20, 8),
  ending_balance DECIMAL(20, 8),
  daily_pnl DECIMAL(20, 8),
  daily_pnl_percent DECIMAL(10, 4),
  trades_count INTEGER,
  wins INTEGER,
  losses INTEGER,
  win_rate DECIMAL(10, 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, bot_mode)
);

-- 7. Sentiment Data
CREATE TABLE IF NOT EXISTS sentiment_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT,
  source TEXT NOT NULL,
  sentiment_score DECIMAL(5, 2),
  fear_greed_index INTEGER,
  news_count INTEGER,
  social_volume INTEGER,
  whale_alerts INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Bot Settings
CREATE TABLE IF NOT EXISTS bot_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_mode TEXT DEFAULT 'paper',
  max_position_size DECIMAL(5, 2) DEFAULT 10,
  risk_per_trade DECIMAL(5, 2) DEFAULT 2,
  max_daily_loss DECIMAL(5, 2) DEFAULT 5,
  max_daily_trades INTEGER DEFAULT 10,
  cooldown_after_losses INTEGER DEFAULT 3,
  watchlist TEXT[] DEFAULT ARRAY['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'],
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO bot_settings (bot_mode, watchlist) VALUES ('paper', ARRAY['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT']);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(created_at);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data(symbol, interval);
CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_performance_date ON performance(date);

-- Enable RLS
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role full access" ON trades FOR ALL USING (true);
CREATE POLICY "Service role full access" ON positions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON market_data FOR ALL USING (true);
CREATE POLICY "Service role full access" ON signals FOR ALL USING (true);
CREATE POLICY "Service role full access" ON backtest_results FOR ALL USING (true);
CREATE POLICY "Service role full access" ON performance FOR ALL USING (true);
CREATE POLICY "Service role full access" ON sentiment_data FOR ALL USING (true);
CREATE POLICY "Service role full access" ON bot_settings FOR ALL USING (true);
