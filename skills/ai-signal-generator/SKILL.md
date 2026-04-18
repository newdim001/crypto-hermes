# SKILL: AI Signal Generator

## Purpose
Combine technical analysis, sentiment, and AI to generate trading signals.

## Input Data Sources
1. Technical Analysis (from technical-analyst)
2. Sentiment Data (from sentiment-collector)
3. Market Data (from market-data-collector)
4. On-chain metrics

## AI Models Used
- **DeepSeek R1** - For reasoning and analysis
- **DeepSeek V3** - For quick signal generation

## Signal Output
```typescript
interface TradingSignal {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'CLOSE' | 'HOLD';
  confidence: number; // 0-100
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  position_size: number; // % of portfolio
  risk_reward: number;
  timeframe: string;
  reason: string; // Human readable explanation
  expiry: Date; // Signal validity
}
```

## Confidence Scoring (AI Decision)

### Factors Weighted
- Technical Alignment: 30%
- Trend Strength: 20%
- Sentiment: 20%
- Volume Confirmation: 15%
- On-chain Metrics: 15%

### Confidence Levels
- **90-100%**: Very high conviction
- **70-89%**: High conviction
- **50-69%**: Medium conviction
- **Below 50%**: Low conviction - No trade

## Risk Rules (Override AI)
- Max position size: 10% of portfolio
- Max daily risk: 5% of portfolio
- Stop loss mandatory for all trades
- No trades during high volatility events

## Usage
```javascript
const signal = await generateSignal('BTCUSDT', '1h')
// Returns detailed trading signal with AI reasoning
```

## Example Output
```json
{
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "confidence": 78,
  "entry_price": 43500,
  "stop_loss": 42800,
  "take_profit": 45200,
  "position_size": 8,
  "risk_reward": 2.1,
  "reasoning": "RSI showing oversold (32), MACD bullish crossover, whale accumulation detected, positive news sentiment"
}
```

## Used By
- paper-trader
- live-trader
- backtester
