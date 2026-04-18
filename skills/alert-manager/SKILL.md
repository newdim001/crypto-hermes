# SKILL: Alert Manager

## Purpose
Send notifications for trades, signals, and critical events.

## Notification Channels
- **Telegram** - Primary (to you)
- **Email** - Resend (optional)
- **Console** - Debug logs

## Alert Types

### Trade Alerts
- Signal generated
- Trade executed
- Trade closed (with P&L)
- Stop loss triggered
- Take profit hit

### Risk Alerts
- Daily loss limit reached (>5%)
- Position size exceeded
- Too many open positions
- Consecutive losses (3+)

### Market Alerts
- Big price move (>5% in 1h)
- Volume spike
- Fear & Greed extreme values
- News event detected

### Performance Alerts
- Daily summary (end of day)
- Weekly summary
- Milestone reached (100%, 50% profit)

## Alert Templates
```javascript
const templates = {
  TRADE_OPENED: `
🚀 *{side} {symbol}*
Entry: ${entryPrice}
Size: {quantity}
SL: {stopLoss} | TP: {takeProfit}
Confidence: {confidence}%
`,
  
  TRADE_CLOSED: `
✅ *{side} {symbol} CLOSED*
Entry: {entryPrice} → Exit: {exitPrice}
P&L: {pnl} ({pnlPercent}%)
{emoji}
`,

  DAILY_SUMMARY: `
📊 *Daily Summary - {date}*
Balance: ${balance}
P&L: {dailyPnl} ({dailyPnlPercent}%)
Trades: {tradesCount} | Wins: {wins} | Losses: {losses}
Win Rate: {winRate}%
`
}
```

## Usage
```javascript
// Send trade alert
await sendAlert('TRADE_OPENED', {
  symbol: 'BTCUSDT',
  side: 'LONG',
  entryPrice: 43000,
  quantity: 0.1,
  stopLoss: 42000,
  takeProfit: 45000,
  confidence: 78
})

// Send risk alert
await sendAlert('RISK_LIMIT', {
  type: 'DAILY_LOSS',
  currentLoss: 4.5,
  limit: 5
})
```

## Used By
- All trading components
