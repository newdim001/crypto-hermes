# SKILL: Technical Analyst

## Purpose
Calculate technical indicators and identify chart patterns for trading signals.

## Indicators Calculated

### Trend Indicators
- **SMA** (Simple Moving Average) - 7, 25, 99, 200 periods
- **EMA** (Exponential Moving Average) - 9, 21, 55 periods
- **Ichimoku Cloud** - Tenkan, Kijun, Senkou Span A/B
- **ADX** - Average Directional Index

### Momentum Indicators
- **RSI** (14 periods) - Overbought >70, Oversold <30
- **MACD** - 12, 26, 9 periods
- **Stochastic** - %K, %D
- **CCI** - Commodity Channel Index

### Volatility Indicators
- **Bollinger Bands** - 20, 2 standard deviations
- **ATR** - Average True Range

### Volume Indicators
- **OBV** - On-Balance Volume
- **VWAP** - Volume Weighted Average Price

## Patterns Detected
- Double Top/Bottom
- Head & Shoulders
- Triangle Patterns (ascending, descending, symmetric)
- Flag & Pennant
- Candlestick Patterns (doji, hammer, engulfing, morning star)

## Signal Generation
```
BUY SIGNALS:
- RSI < 30 (oversold) + Bullish divergence
- MACD bullish crossover
- Price above 200 EMA + trend confirmation
- Bullish engulfing candle
- Breakout from consolidation + volume

SELL SIGNALS:
- RSI > 70 (overbought)
- MACD bearish crossover
- Price below 200 EMA
- Bearish engulfing candle
- Stop loss hit
```

## Usage
```javascript
const analysis = await analyzeSymbol('BTCUSDT', '1h')
// Returns: { signals: ['BUY'], indicators: {...}, patterns: [...] }
```

## Used By
- ai-signal-generator
- backtester
