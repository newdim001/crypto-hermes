# CryptoBot - Autonomous Trading System

## 🆕 Recently Im Tests
```plemented

### Unitbash
node services/testing/unit-tests/core.test.js
```

### Monte Carlo Simulation
```bash
# Run 10,000 simulations
node services/testing/monte-carlo.js

# In code:
const { MonteCarloSimulator } = require('./services/testing/monte-carlo');
const sim = new MonteCarloSimulator({ numSimulations: 10000 });
const results = await sim.run();
```

### Data Backup (3-2-1 Rule)
```bash
# Create daily backup
node services/testing/backup-service.js daily

# Create weekly backup  
node services/testing/backup-service.js weekly

# List backups
node services/testing/backup-service.js list

# Restore from backup
node services/testing/backup-service.js restore backup-daily-2026-02-28
```

### Latency Monitoring
```bash
# Check status
node services/monitoring/latency-monitor.js status

# View 24h stats
node services/monitoring/latency-monitor.js stats

# Test readings
node services/monitoring/latency-monitor.js test
```

### Sector Exposure Limits
```bash
# Check current exposure
node services/risk/sector-exposure.js status

# Check if can open position
node services/risk/sector-exposure.js can-open BTC 1500 long

# Auto-reduce to meet limits
node services/risk/sector-exposure.js auto-reduce

# Add position
node services/risk/sector-exposure.js add BTC 0.1 50000 long
```

### Kill Switch Testing
```bash
# Run tests
node services/testing/kill-switch-test.js run

# Check schedule
node services/testing/kill-switch-test.js schedule

# View history
node services/testing/kill-switch-test.js history
```

## 🏗️ Architecture

```
crypto-bot/
├── agents/              # AI agents (trader, risk manager, etc.)
├── config/              # Configuration files
├── data/                # Trading data, positions, logs
├── docs/               # Documentation
├── services/
│   ├── audit/          # Audit logging
│   ├── audit-fixes/    # Applied fixes
│   ├── communication/ # Agent messaging
│   ├── consensus/     # Multi-agent voting
│   ├── data-collector # Market data collection
│   ├── data-validator # Data validation
│   ├── execution/     # Order execution
│   ├── fee/           # Fee calculation
│   ├── journal/       # Trading journal
│   ├── learning/      # ML & adaptation
│   ├── market/        # Market analysis
│   ├── missing/       # Advanced features
│   ├── ml/            # Machine learning
│   ├── monitoring/    # Latency & performance
│   ├── risk/          # Risk management
│   ├── state/         # State persistence
│   ├── stress-test/  # Stress testing
│   ├── testing/       # Tests & backups
│   └── versioning/   # Model versioning
└── skills/            # OpenClaw skills
```

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure:**
   - Copy `config/sample.yaml` to `config.yaml`
   - Add your API keys
   - Set risk parameters

3. **Run in paper trading mode:**
   ```bash
   npm run paper
   ```

4. **Monitor:**
   ```bash
   # View logs
   tail -f logs/trading.log
   
   # Check status
   node services/risk/sector-exposure.js status
   ```

## ⚠️ Before Going Live

1. ✅ Run Monte Carlo simulation
2. ✅ Pass all kill switch tests
3. ✅ Configure data backups
4. ✅ Set up latency monitoring
5. ✅ Configure sector exposure limits
6. ✅ Run server hardening script
7. ✅ Test emergency procedures

## 📊 Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Data Collector | */15 * * * * | Fetch market data |
| Risk Checker | */5 * * * * | Check risk limits |
| Trading Bot | 0 * * * * | Execute trades |
| Performance | 0 21 * * * | Daily report |

## 🔒 Security

- API keys: Ed25519 asymmetric keys
- IP whitelisting enabled
- Withdrawals disabled on trading keys
- Hardware security module recommended for >$100k

## 📈 Performance

Target metrics:
- Win rate: 55%+
- Risk/reward: 1.5:1+
- Max drawdown: <15%
- Survival rate (Monte Carlo): >95%
