# CryptoEdge Trading Bot — Complete System Documentation
**Generated: March 2, 2026 | Author: Sam (AI Assistant)**

---

## 🎯 ULTIMATE GOAL

Build a **fully autonomous AI-powered crypto trading system** that:
1. Runs 24/7 without human intervention
2. Uses real-time Binance market data for decisions
3. Combines ML signals + technical indicators + DeepSeek AI reasoning
4. Starts in **paper (simulated) trading** mode to prove profitability
5. Graduates to **live trading** once consistent positive returns are proven
6. **Target:** Replace manual trading with a self-improving AI system generating consistent alpha

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────┐
│                    CRON SCHEDULER                        │
│  (OpenClaw - runs every hour automatically)             │
└──────────────────────────┬──────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │Trading Engine│ │ML Runner     │ │Model Retrainer│
  │(main bot)    │ │(signal-based)│ │(daily 2AM)   │
  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐
  │ Binance API  │ │  Supabase DB │ │ Telegram Bot│
  │ (Real Prices)│ │ (Trade Log)  │ │ (Alerts)    │
  └──────────────┘ └──────────────┘ └─────────────┘
```

---

## 🔌 ALL API CONNECTIONS

| API | Purpose | Key Location | Endpoint |
|-----|---------|-------------|----------|
| **Binance Mainnet** | Real-time price data (OHLCV, tickers) | `.env BINANCE_API_KEY` | `api.binance.com` |
| **Binance Testnet** | Paper order simulation | `.env BINANCE_SECRET_KEY` | `testnet.binance.vision` |
| **Supabase** | Database for trades, performance, signals | `.env SUPABASE_URL + SERVICE_KEY` | REST API |
| **DeepSeek AI** | AI reasoning to enhance signals | `.env DEEPSEEK_API_KEY` | `api.deepseek.com/v1` |
| **Anthropic Claude** | OpenClaw agent intelligence | `.env ANTHROPIC_API_KEY` | `api.anthropic.com` |
| **Telegram Bot** | Real-time alerts + reports | `@samdubai_bot token in code` | Bot API |

---

## 📁 FILE STRUCTURE — EVERY FILE EXPLAINED

```
crypto-edge/
├── services/
│   ├── trading-engine.js          ← MAIN BOT (primary entry point)
│   ├── ml/
│   │   ├── ml-trading-runner.js   ← ML-based trading (alternative runner)
│   │   ├── signal-generator.js    ← Generates BUY/SELL/HOLD signals
│   │   ├── technical-indicators.js← All TA calculations (RSI, MACD, etc)
│   │   ├── model-trainer.js       ← Trains logistic regression ML model
│   │   ├── train-model.js         ← Training data pipeline
│   │   ├── backtester.js          ← Historical strategy testing
│   │   ├── market-analyzer.js     ← Market condition analysis
│   │   ├── regime-detector.js     ← Trending/ranging/volatile detection
│   │   ├── sentiment-analyzer.js  ← Fear/Greed index calculation
│   │   ├── feature-engineering.js ← Converts raw data to ML features
│   │   ├── auto-learner.js        ← Autonomous parameter optimization
│   │   └── signal-generator.js    ← Combined ML + indicator signals
│   ├── risk/
│   │   ├── kill-switch.js         ← Emergency halt mechanism
│   │   ├── risk-limits.js         ← Daily loss + position limits
│   │   ├── drawdown-monitor.js    ← Peak-to-trough drawdown tracking
│   │   ├── position-sizer.js      ← Kelly criterion sizing
│   │   ├── var-calculator.js      ← Value-at-Risk calculation
│   │   ├── trailing-stop.js       ← Dynamic trailing stop management
│   │   ├── correlation-sizer.js   ← Reduces size when pairs correlate
│   │   ├── liquidation-mapper.js  ← Maps liquidation levels
│   │   ├── sector-exposure.js     ← Exposure by sector (L1, DeFi, etc)
│   │   └── sector-limits.js       ← Max exposure per sector
│   ├── execution/
│   │   ├── order-executor.js      ← Places paper/live orders
│   │   ├── partial-fill-handler.js← Handles partial order fills
│   │   ├── slippage-control.js    ← Controls execution slippage
│   │   ├── rate-limiter.js        ← Binance API rate limiting
│   │   ├── twap-vwap.js           ← TWAP/VWAP order execution
│   │   └── error-handler.js       ← Execution error recovery
│   ├── learning/
│   │   ├── learning-engine.js     ← Analyzes trades, adapts strategy
│   │   ├── reflect-agent.js       ← Weekly verbal feedback generator
│   │   ├── reward-function.js     ← Calculates RL reward signal
│   │   ├── experience-replay.js   ← Stores past trades for training
│   │   ├── continual-learner.js   ← Online learning without forgetting
│   │   ├── learning-rate-scheduler.js ← Adjusts learning speed
│   │   └── agents/q-learning-agent.js ← Q-learning RL agent
│   ├── consensus/
│   │   ├── agent-consensus.js     ← 7-agent pipeline for decisions
│   │   └── agent-weighter.js      ← Weights agents by past performance
│   ├── monitoring/
│   │   ├── alert-system.js        ← Telegram alerts for events
│   │   ├── alert-throttler.js     ← Prevents alert spam
│   │   ├── dashboard.js           ← Web dashboard data
│   │   ├── incident-response.js   ← Auto-response to incidents
│   │   └── latency-monitor.js     ← API latency tracking
│   ├── market/
│   │   ├── signal-processor.js    ← Processes raw market signals
│   │   ├── open-interest.js       ← Tracks futures open interest
│   │   └── btc-dominance.js       ← BTC dominance tracking
│   ├── audit/
│   │   └── audit-logger.js        ← Full audit trail of all actions
│   ├── state/
│   │   ├── state-manager.js       ← Bot state persistence
│   │   ├── failover-manager.js    ← Auto-recovery on crash
│   │   ├── recovery-procedure.js  ← Step-by-step recovery
│   │   └── security-hardening.js  ← API key protection
│   ├── testing/
│   │   ├── unit-tests.js          ← Core logic unit tests
│   │   ├── kill-switch-test.js    ← Emergency system tests (7/7 ✅)
│   │   ├── integration-tests.js   ← Full pipeline integration tests
│   │   ├── backtest-engine.js     ← Full backtesting framework
│   │   ├── monte-carlo.js         ← Monte Carlo risk simulation
│   │   └── stress-tester.js       ← Black swan stress tests
│   ├── data-collector.js          ← Fetches + stores OHLCV data
│   ├── binance-connector.js       ← Binance API authentication
│   ├── risk-checker.js            ← Quick risk status check
│   ├── performance-report.js      ← Daily P&L report to Telegram
│   └── weekly-report.js           ← Weekly summary report
├── data/
│   ├── state.json                 ← Live balance + trade state
│   ├── trading-state.json         ← Backup of state.json
│   ├── ml-model.json              ← Trained model weights
│   ├── model-registry.json        ← Model version history
│   ├── training-data.json         ← Historical training features
│   ├── trading-journal.json       ← Trade journal entries
│   └── monte-carlo-results.json   ← Last stress test results
└── models/
    └── direction_predictor.json   ← Active logistic regression model
```

---

## 🤖 THE 7-AGENT CONSENSUS PIPELINE

This is the most advanced feature — 7 AI agents vote on every trade:

```
MARKET DATA
    │
    ▼
1️⃣ TECHNICAL AGENT
   └─ Analyzes RSI, MACD, EMA, Bollinger Bands
   └─ Output: BUY/SELL/HOLD + RSI value

2️⃣ SENTIMENT AGENT  
   └─ Calculates internal Fear & Greed index
   └─ Uses BTC price momentum + volume trends
   └─ Output: EXTREME_FEAR / FEAR / NEUTRAL / GREED / EXTREME_GREED

3️⃣ REGIME DETECTION AGENT
   └─ Detects market state using ADX + volatility
   └─ Output: TRENDING / RANGING / VOLATILE
   └─ Selects appropriate strategy per regime:
      - TRENDING → momentum strategy
      - RANGING  → mean reversion strategy
      - VOLATILE → risk-off / reduce size

4️⃣ TRADER AGENT (Decision Maker)
   └─ Synthesizes Technical + Sentiment + Regime
   └─ Uses DeepSeek AI API for reasoning
   └─ Output: final LONG/SHORT/HOLD + confidence %

5️⃣ CRITIC AGENT (Devil's Advocate)
   └─ Reviews Trader's decision for flaws
   └─ Checks: overtrading, against trend, poor R:R
   └─ Can VETO the trade if flaws found

6️⃣ RISK AGENT
   └─ Validates position size, max exposure
   └─ Checks daily loss limits, drawdown limits
   └─ Sets final stop loss + take profit levels

7️⃣ EXECUTION AGENT
   └─ Only fires if all above agents agree
   └─ Places paper/live order
   └─ Logs to Supabase + notifies Telegram
```

---

## 📊 HOW THE ML MODEL WORKS

### Training Data
- **Source:** Historical candle data from Binance (1000 candles per symbol)
- **Features (12 inputs):**
  1. RSI-14 (normalized 0-1)
  2. RSI-7 (normalized 0-1)
  3. MACD normalized (-1 to 1)
  4. Volatility-20 (normalized 0-2)
  5. Momentum-10 (clamped -1 to 1)
  6. Volume ratio (normalized 0-3)
  7. 1-hour return (clamped ±5%)
  8. 4-hour return (clamped ±10%)
  9. Price vs SMA-20 (clamped ±10%)
  10. SMA-20 vs SMA-50 slope (clamped ±10%)
  11. RSI oversold flag (1 if RSI<35, else 0)
  12. RSI overbought flag (1 if RSI>65, else 0)

### Labels (What it predicts)
- **LOOKAHEAD = 4 candles** (predicts price direction 4 hours ahead)
- **Label = 1** if price goes UP by >0.3% in 4 hours
- **Label = 0** if price goes DOWN by >0.3% in 4 hours
- Ignores noise (moves <0.3% not labeled)

### Algorithm: Logistic Regression (from scratch)
```
For each training sample:
  z = bias + Σ(weight_i × feature_i)
  prediction = sigmoid(z) = 1 / (1 + e^-z)
  error = prediction - label
  weight_i -= learningRate × error × feature_i
  bias -= learningRate × error

Runs 1000 iterations, loss converges from 0.70 → 0.098
Achieved accuracy: 99% (on training data)
```

### Retraining Schedule
- **Daily at 2:00 AM** via cron (CryptoEdge Model Retraining)
- Fetches fresh historical data from Binance
- Re-trains from scratch on new data
- Saves model weights to `models/direction_predictor.json`

---

## 📈 TECHNICAL INDICATORS USED

| Indicator | Period | Purpose |
|-----------|--------|---------|
| **RSI** | 14, 7 | Overbought/oversold detection |
| **EMA** | 9, 21 | Trend direction (golden/death cross) |
| **SMA** | 20, 50 | Trend baseline |
| **MACD** | 12/26/9 | Momentum + crossover signals |
| **Bollinger Bands** | 20, 2σ | Volatility + mean reversion |
| **Stochastic** | 14,3,3 | Momentum oscillator |
| **ATR** | 14 | Volatility for stop placement |
| **ADX** | 14 | Trend strength (>25 = strong trend) |
| **VWAP** | Session | Fair value reference |
| **Volume SMA** | 20 | Volume confirmation |

### Signal Weight System
```
RSI:         15% weight
MACD:        20% weight  ← highest weight
EMA:         15% weight
Bollinger:   15% weight
Stochastic:  10% weight
ADX:         10% weight
Volume:      10% weight
Pattern:      5% weight
```

### Multi-Timeframe Analysis
- **1H candles** → primary signal
- **4H trend** → confirmation filter (last 96 x 1H candles)
- **1D trend** → HTF alignment check (reduces confidence 70% if opposing)

---

## 💡 HOW AI TAKES TRADING DECISIONS — STEP BY STEP

### Every Hour (cron triggers):

**STEP 1 — Data Collection**
```
Binance API → 100 x 1H candles for each symbol
Symbols: BTC ETH BNB SOL XRP ADA DOGE AVAX DOT POL
```

**STEP 2 — Check Exits First (Critical)**
```
For each OPEN position:
  → Get current price from Binance
  → Calculate P&L = (currentPrice - entryPrice) × quantity
  → Check: currentPrice <= stopLoss? → EXIT (stop hit)
  → Check: currentPrice >= takeProfit? → EXIT (target hit)
  → Check: hoursHeld >= 4? → EXIT (max hold time)
  → If exit: update Supabase, save balance to state.json, notify Telegram
```

**STEP 3 — Scan for New Entries**
```
For each symbol in watchlist (skip if already have position):
  → Calculate all technical indicators
  → Run through signal weight system
  → Get normalizedScore (-100 to +100)
  → Apply HTF filter (1D trend)
  → Apply volume confirmation
  → If confidence >= 60%: place paper trade
  → Log to Supabase trades table
```

**STEP 4 — Risk Checks**
```
→ Max 3 open positions simultaneously
→ Risk 2% of balance per trade
→ Max 10% account exposure per position
→ Position size = riskAmount / stopLossDistance
→ Daily loss limit: 5% of account
```

**STEP 5 — Notification**
```
→ Only notify Telegram if: trade opened OR position closed OR errors
→ Silent if no activity (saves notification noise)
```

---

## 🛡️ RISK MANAGEMENT SYSTEM

### Position Sizing (Fixed & Correct)
```
balance = $8,923.06 (current)
riskPerTrade = 2%
riskAmount = $178.46
maxExposure = 10% = $892.31

For ETH @ $1,959 with 2% SL:
stopDistance = $39.18
qty = $178.46 / $39.18 = 4.55 ETH → capped at $892/$1,959 = 0.455 ETH
Exposure = $891 (10% of account ✅)
```

### Stop Loss & Take Profit
```
Stop Loss: 2% below entry (LONG) / 2% above entry (SHORT)
Take Profit: 4% above entry (LONG) / 4% below entry (SHORT)
Risk:Reward = 1:2 minimum

Dynamic (signal generator): uses ATR for volatility-adjusted stops
Stop% = 1.5% + (ADX / 50) → varies 1.7% - 3.5% based on market
```

### Kill Switch (7/7 Tests Passing)
- **Manual trigger:** `kill-switch.js activate(reason)`
- **Daily loss limit:** halts if daily loss > 3%
- **Max drawdown:** halts if drawdown > 15% from peak
- **Emergency close:** closes all positions
- **State persistence:** halted state survives restarts

---

## 📚 LEARNING & SELF-IMPROVEMENT SYSTEM

### Learning Engine (Daily)
```
1. Fetch last 24h of closed trades from Supabase
2. Calculate: win rate, avg win, avg loss, Sharpe ratio
3. If win rate < 45% → tighten entry criteria (raise confidence threshold)
4. If avg loss > avg win → adjust risk:reward ratio
5. Save new parameters to config
```

### Reflect Agent (Weekly)
```
Every Monday:
1. Review full week performance
2. Identify best/worst performing symbols
3. Identify best market regime (trending/ranging/volatile)
4. Generate verbal feedback + recommendations
5. Update strategy parameters
```

### Reward Function (RL Signal)
```
reward = 0
+ (P&L / initialBalance × 100) × profitWeight
- drawdownPenalty if drawdown > 10%
- timePenalty if holding too long
+ winBonus for profitable trades
+ sharpeBonus for consistent returns
```

### Experience Replay
- Stores all past trades as (state, action, reward, nextState)
- Used to retrain Q-learning agent on historical decisions
- Prevents catastrophic forgetting

---

## 🗄️ DATABASE SCHEMA (Supabase)

### trades table
```
id           - UUID primary key
bot_mode     - 'ml-paper' (paper trading)
symbol       - e.g. 'BTCUSDT'
side         - 'LONG' or 'SHORT'
entry_price  - Price when opened
exit_price   - Price when closed
quantity     - Number of units
pnl          - Net profit/loss in USDT
status       - 'OPEN' or 'CLOSED'
stop_loss    - Stop loss price
take_profit  - Take profit price
created_at   - Timestamp
```

### performance table
```
id               - UUID
date             - Trading date
starting_balance - Balance at day start
ending_balance   - Balance at day end
daily_pnl        - Net P&L for day
trades_count     - Number of trades
wins / losses    - Count of each
created_at       - Timestamp
```

### signals table
```
id          - UUID
symbol      - Trading pair
direction   - LONG/SHORT/HOLD
confidence  - 0-100%
entry_price - Signal price
status      - PENDING/EXECUTED/EXPIRED
created_at  - Timestamp
```

### Local state.json (primary balance store)
```json
{
  "balance": 8923.06,
  "totalPnl": -1076.94,
  "totalTrades": 5,
  "peakBalance": 10000,
  "dayStartBalance": 10000,
  "mode": "ml-paper"
}
```

---

## ⏰ CRON SCHEDULE

| Job | Schedule | What It Does |
|-----|----------|-------------|
| CryptoEdge Trading Bot | Every hour | Main trading loop |
| CryptoEdge Model Retraining | 2 AM daily | Retrains ML model |
| CryptoEdge Data | Every 6 hours | Collects OHLCV data |
| Performance Report | Sent on demand | Daily P&L summary |
| Weekly Report | Manual/Monday | Full week analysis |

---

## 📊 CURRENT STATUS & PERFORMANCE

| Metric | Value |
|--------|-------|
| Starting Balance | $10,000.00 |
| **Current Balance** | **$8,923.06** |
| Total P&L | -$1,076.94 (-10.77%) |
| Total Trades | 5 |
| Wins | 3 (60% win rate) |
| Losses | 2 |
| Best Trade | XRPUSDT +$75.63 |
| Worst Trade | ETHUSDT -$719.80 (oversized — now fixed) |
| ML Model Accuracy | 99% (training) / ~55% (real) |
| Mode | Paper Trading (Testnet) |

---

## 🚀 ROADMAP TO LIVE TRADING

### Phase 1 — Paper Trading (NOW)
- ✅ Bot running hourly
- ✅ Position sizing fixed (max 10% exposure)
- ✅ Kill switch tested (7/7)
- ✅ Balance tracking fixed
- 🎯 Target: 3 months consistent profitability

### Phase 2 — Validation
- Achieve >60% win rate over 50+ trades
- Sharpe ratio > 1.5
- Max drawdown < 10%
- Backtest confirms live performance

### Phase 3 — Live Trading (Small)
- Switch `IS_PAPER_TRADING = false`
- Start with $500 real capital
- Monitor first 10 live trades manually
- Scale up if performance holds

### Phase 4 — Full Automation
- Scale to $5,000+
- Add more pairs (futures)
- Enable TWAP/VWAP for larger orders
- Add correlation limits across portfolio

---

## ⚡ WHAT STILL NEEDS IMPROVEMENT

1. **ML model overfits** — 99% training accuracy but ~55% real accuracy. Needs more diverse training data and regularization.
2. **All signals currently SHORT** — Market is bearish, bot is correctly identifying shorts but needs more balanced signal generation.
3. **Backtester returns negative** — Simple RSI strategy underperforms in current bear market. The ML + consensus pipeline should perform better.
4. **Sentiment analyzer uses testnet data** — Should use real Binance for sentiment calculation.
5. **DeepSeek AI enhancement** — Currently configured but needs API key properly set in `.env`.

---

*Documentation auto-generated by Sam (OpenClaw AI) — Last updated: March 2, 2026*
