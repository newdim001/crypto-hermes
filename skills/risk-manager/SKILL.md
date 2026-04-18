# SKILL: Risk Manager

## Purpose
Calculate position sizes, set stop losses, and enforce risk rules.

## Risk Parameters

### Position Sizing
```
Position Size = (Account Balance × Risk%) / (Entry - Stop Loss)
```
- **Risk per trade**: 1-2% of account
- **Max position size**: 10% of account
- **Max open positions**: 5

### Stop Loss Rules
- **Hard stop**: Mandatory loss limit
- **Trailing stop**: Lock in profits
- **Time-based stop**: Exit if no movement

### Daily Limits
- **Max daily loss**: 5% of account
- **Max trades per day**: 10
- **Cooldown after**: 3 losses in a row

### Portfolio Limits
- **Max correlation**: 70% (same direction trades)
- **Max sector exposure**: 40%
- **Max leverage**: 3x (if using futures)

## Risk Metrics Tracked
- Current exposure
- Available capital
- Daily P&L
- Win rate
- Average win/loss
- Sharpe ratio (live)

## Emergency Procedures
1. **Circuit Breaker**: Close all positions if daily loss > 5%
2. **Pause Trading**: After 3 consecutive losses
3. **Emergency Exit**: Market closes, extreme volatility

## Usage
```javascript
// Calculate position size
const size = await calculatePositionSize({
  accountBalance: 1000,
  riskPercent: 2,
  entryPrice: 43000,
  stopLoss: 42000
})

// Check if trade allowed
const allowed = await canOpenTrade({
  symbol: 'BTCUSDT',
  side: 'LONG',
  size: 0.1
})
```

## Used By
- paper-trader
- live-trader
- ai-signal-generator
