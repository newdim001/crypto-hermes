# Emergency Procedures - CryptoEdge Trading Bot

## 🚨 Emergency Contacts

| Role | Contact | Response Time |
|------|---------|---------------|
| Primary | Sam (AI) | Immediate |
| Secondary | Suren (Telegram) | < 5 min |
| Escalation | Phone call | < 15 min |

---

## 🔴 Emergency Levels

### Level 1: WARNING
- Daily loss > 2%
- Position drawdown > 5%
- **Action:** Alert sent, continue monitoring

### Level 2: CRITICAL
- Daily loss > 5%
- Position drawdown > 10%
- **Action:** Pause new trades, close losing positions

### Level 3: HALT
- Daily loss > 15%
- Max drawdown > 20%
- API failure > 5 minutes
- **Action:** Kill switch triggered, close ALL positions

---

## 🛑 Kill Switch Procedures

### Manual Kill Switch
```
Command: node services/trading-engine.js --kill
Action: Closes all open positions at market, disables bot
```

### Automatic Kill Triggers
1. Daily loss exceeds 15%
2. Total drawdown exceeds 20%
3. 3 consecutive losing trades (configurable)
4. API failure for > 5 minutes

### Kill Switch Execution
1. Fetch all open positions from database
2. For each position:
   - Get current market price
   - Calculate closing quantity
   - Execute market sell (paper trading = simulated)
   - Record exit in database
3. Update account balance to reflect closed positions
4. Send Telegram alert to user
5. Disable bot until manually re-enabled

---

## 💥 Failure Scenarios

### Scenario 1: Internet Outage
```
Detection: WebSocket disconnect > 30 seconds
Action:
  1. Attempt reconnection 3 times
  2. If failed, use REST API for status check
  3. If positions at risk, close via REST
  4. Alert user via Telegram
  5. Resume when connection restored
```

### Scenario 2: Exchange API Failure
```
Detection: API returns error code
Action:
  1. Retry with exponential backoff (1s, 2s, 4s, 8s)
  2. If 3 retries fail, check exchange status page
  3. If exchange down, enter safe mode:
     - No new trades
     - Monitor existing positions
     - Use cached prices for P/L
  4. Resume when API recovers
```

### Scenario 3: Database Corruption
```
Detection: Supabase connection fails
Action:
  1. Check database connectivity
  2. If corrupted:
     - Restore from last backup
     - Recalculate positions from exchange
     - Log incident
  3. Manual intervention required
```

### Scenario 4: Extreme Volatility
```
Detection: Price moves > 10% in 5 minutes
Action:
  1. Widen stops by 50%
  2. Reduce new position sizes by 50%
  3. Increase monitoring frequency
  4. Alert user
```

---

## 🔄 Recovery Procedures

### After Kill Switch Triggered
1. **Assess**: Review what caused the halt
2. **Analyze**: Check P/L impact
3. **Decide**: Manual restart or stay halted
4. **Restart**: 
   ```
   node services/trading-engine.js --resume
   ```
5. **Monitor**: Extra vigilance for 24 hours

### After Server Restart
1. Check last known state in database
2. Verify open positions match exchange
3. Sync any discrepancies
4. Resume normal operation

---

## 📋 Testing Schedule

| Test | Frequency | Who |
|------|-----------|-----|
| Kill switch | Monthly | Sam |
| Internet failover | Weekly | Sam |
| Database backup | Daily | Auto |
| API error handling | Continuous | Sam |
| Full recovery drill | Quarterly | Suren |

---

## ✅ Pre-Flight Checklist (Before Each Trading Day)

- [ ] Database accessible
- [ ] API keys valid
- [ ] Telegram bot responding
- [ ] WebSocket connected
- [ ] Prices updating
- [ ] Risk limits configured
- [ ] Kill switch tested
- [ ] Backup verified

---

## 📞 User Notification Template

```
🚨 CRYPTOEDGE ALERT

Type: [WARNING/CRITICAL/HALTED]
Issue: [Description]
Action Taken: [What bot did]
Current Status: [OK/PAUSED/HALTED]
Balance Impact: $[Amount]

Reply 'RESUME' to restart after HALT.
```

---

Last Updated: 2026-02-28
