# SKILL: Backtester

## Purpose
Test trading strategies on historical data to validate performance.

## Backtesting Parameters
- Initial Capital: $1000
- Commission: 0.1% (Binance maker fee)
- Slippage: 0.05%
- Time Period: 3-4 weeks historical

## Metrics Calculated
- **Total Return** - % gain/loss
- **Sharpe Ratio** - Risk-adjusted return
- **Max Drawdown** - Largest peak-to-trough
- **Win Rate** - % profitable trades
- **Profit Factor** - Gross profit / Gross loss
- **Average Trade** - Mean P&L per trade
- **Trade Count** - Total number of trades
- **Holding Time** - Average trade duration

## Performance Benchmarks
```
EXCELLENT:  Sharpe > 2.0, Drawdown < 10%, Win Rate > 60%
GOOD:       Sharpe > 1.5, Drawdown < 15%, Win Rate > 50%
ACCEPTABLE: Sharpe > 1.0, Drawdown < 20%, Win Rate > 45%
POOR:       Below acceptable metrics
```

## Strategy Validation
- Test on multiple timeframes
- Test on multiple symbols
- Monte Carlo simulation for confidence
- Walk-forward analysis

## Database Storage
- Table: `backtest_results`
- Columns: strategy_name, symbol, timeframe, start_date, end_date, metrics

## Usage
```javascript
const results = await backtest({
  strategy: 'ai-signal',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  startDate: '2024-01-01',
  endDate: '2024-02-01',
  initialCapital: 1000
})
// Returns detailed performance metrics
```

## Used By
- qa agent (for validation)
