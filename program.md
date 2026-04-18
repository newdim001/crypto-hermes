# CryptoHermes Trading Program - Instructions for Sam (Hermes AI)

## 🎯 MISSION
Manage the CryptoHermes trading bot to achieve consistent positive returns through systematic experimentation and disciplined risk management.

## 📊 GOALS (in priority order)

1. **Maximize Win Rate** - Target >55% accuracy
2. **Minimize Drawdown** - Keep max drawdown <10%
3. **Positive P&L** - End with more money than we started
4. **Consistent Performance** - Similar results across different market conditions

## ⚠️ CONSTRAINTS (NEVER VIOLATE)

### Risk Management
- **Maximum 2% risk per trade**
- **Maximum 3 open positions at once**
- **Maximum 5% daily loss limit** - STOP if reached
- **Maximum 15% total drawdown** - HALT TRADING if reached

### Trading Rules
- Only trade these symbols: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT
- Use 1-hour timeframe only
- Never trade against strong trends (ADX < 20)
- Always set stop loss and take profit

### Mode Rules
- **Paper trading ONLY** until win rate >55% for 50+ trades
- **Shadow trading continues** regardless of mode
- Log ALL experiments with results

## 📈 SUCCESS METRICS

Primary (evaluated after each experiment):
- Win Rate (%)
- Total P&L ($)
- Max Drawdown (%)
- Sharpe Ratio

Secondary:
- Average trade holding time
- Best/worst trade
- Trades per symbol

## 🔧 WHAT YOU CAN MODIFY

You may edit these files:
- `services/ml/signal-generator-v3.js` - Main signal generation logic
- `services/ml/learned-signal-generator.js` - Signal scoring weights
- `services/risk/dynamic-position-sizer.js` - Position sizing rules
- `services/market/support-resistance.js` - S/R level detection

## 🚫 WHAT YOU CANNOT MODIFY (Without Analysis)

- Risk management constraints (max 2% per trade, etc.)
- Trading hours (UTC 6:00 - 22:00)
- Paper trading mode enforcement
- Evaluation metrics calculation

## 🔄 RECOVERY MODE (Replaces Blacklist)

Instead of blacklisting after 3 consecutive losses, the system now uses **recovery mode**:
- **Position size**: Reduced to 50% for 3 trades
- **Confidence**: Requires +10% higher confidence to enter
- **Philosophy**: Learn and adapt rather than stop trying

After 3 recovery trades, the system returns to normal sizing.

## 📊 MARKET REGIME DETECTION

The system now detects and trades different market conditions:

### SIDEWAYS/RANGING Markets (ADX < 20)
- **Strategy**: Mean reversion
- **Buy signal**: RSI oversold (<35) + price near lower Bollinger Band (<25% of band width)
- **Sell signal**: RSI overbought (>65) + price near upper Bollinger Band (>75% of band width)
- **Volume confirmation**: High volume (>1.2x) strengthens signal
- **Exit**: Quick targets, tighter stops (range is bounded)

### TRENDING Markets (ADX 20-40)
- **Strategy**: Trend following
- **Buy signal**: RSI oversold + aligned 1H/4H trend + positive MACD
- **Sell signal**: RSI overbought + aligned downtrend + negative MACD
- **Confirmation**: Multiple indicators agreeing

### STRONG TREND Markets (ADX > 40)
- **Strategy**: Momentum continuation
- **Higher confidence thresholds**: 75%+ required
- **Trailing stops**: Activate earlier to protect profits

## 📝 EXPERIMENT LOG FORMAT

When you run an experiment, log:
```
Experiment #[N]
Timestamp: [ISO timestamp]
Change Made: [Description of what you changed]
Win Rate: [%]
Total P&L: [$]
Max Drawdown: [%]
Result: IMPROVED / REVERTED / NEUTRAL
Reasoning: [Why this worked or didn't work]
```

## 🎓 LEARNING FROM HISTORY

The brain already knows:
- Volume indicator is 87% accurate (use heavily!)
- RSI is only 24% accurate (use sparingly)
- BB is only 6% accurate (ignore mostly)
- MACD/EMA/Trend are ~47% accurate (use normally)

## 💡 SUGGESTED IMPROVEMENT AREAS

1. **Signal Generation**
   - Better confluence requirements (multiple indicators agreeing)
   - Time-of-day filters
   - Multi-timeframe confirmation

2. **Risk Management**
   - Dynamic stop loss placement
   - Trailing take profits
   - Correlation-based position sizing

3. **Entry Timing**
   - Wait for pullbacks vs trend continuation
   - Candlestick pattern confirmation
   - Volume spike confirmation

4. **Exit Strategy**
   - Partial profit taking
   - Time-based exits
   - Trailing stops

## 🔄 THE EXPERIMENT LOOP

1. Read this program.md
2. Analyze current strategy performance
3. Propose ONE specific change
4. Implement the change
5. Run paper trading for 1-4 hours (or until 5+ trades)
6. Evaluate against success metrics
7. Keep change if IMPROVED, revert if REVERTED
8. Log the experiment
9. Repeat

## ⚡ QUICK START COMMANDS

```bash
# Run one experiment cycle
node services/learning/auto-research-runner.js experiment

# Check current performance
node services/learning/auto-research-runner.js status

# Run continuous overnight experiments
node services/learning/auto-research-runner.js overnight

# View experiment history
cat data/experiment-log.json

# Run trading cycle (Hermes controlled)
~/.hermes/crypto-hermes/run-hermes-cycle.sh

# Check status
~/.hermes/crypto-hermes/hermes-status.sh
```

## 🎯 SUCCESS CRITERIA

System is ready for LIVE trading when:
- Win rate >55% for 100+ trades
- Max drawdown <10%
- Sharpe ratio >1.0
- Profitable for 30+ consecutive days

---

*Last Updated: 2026-04-18*
*Author: Sam (Hermes AI)*
*Instance: CryptoHermes v1.0*
*Controlled by: Hermes Agent (Sam)*
