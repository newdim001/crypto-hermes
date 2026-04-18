# SKILL: Paper Trader

## Purpose
Simulate trades without real money using testnet/paper trading.

## Paper Trading Mode
- **Exchange**: Binance Testnet (testnet.binance.vision)
- **Initial Capital**: $1000 USDT
- **Fee**: Simulated 0.1%

## Features
- Real-time signal execution
- Simulated fills at market price
- Full P&L tracking
- Position management
- Risk rule enforcement (paper mode)

## Trade Simulation
```typescript
interface PaperTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  quantity: number;
  entry_time: Date;
  exit_price?: number;
  exit_time?: Date;
  pnl?: number;
  pnl_percent?: number;
  status: 'OPEN' | 'CLOSED';
  signal_reason: string;
}
```

## Paper Trading Rules
1. Always respect stop-loss
2. Max 10% position size
3. Max 5% daily risk
4. No revenge trading (after 2 losses)
5. Cooldown after 3 consecutive losses

## Portfolio Tracking
```typescript
interface PaperPortfolio {
  total_balance: number; // Starts at $1000
  initial_balance: number;
  open_positions: PaperTrade[];
  closed_trades: PaperTrade[];
  daily_pnl: number;
  total_pnl: number;
  win_rate: number;
}
```

## Usage
```javascript
// Execute paper trade
await paperTrade(signal)

// Check portfolio
const portfolio = await getPaperPortfolio()
```

## Database Storage
- Table: `paper_trades`
- Table: `paper_portfolio`

## Transition to Live
After 3-4 weeks of profitable paper trading:
1. Review metrics
2. Check max drawdown < 20%
3. Verify consistent profit
4. Then enable live trading
