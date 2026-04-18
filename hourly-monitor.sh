#!/bin/bash
# CryptoEdge Hourly Monitor - Runs every hour, alerts on important events only

cd ~/.openclaw/workspace/crypto-edge

# Get previous balance for comparison
PREV_BALANCE=$(cat logs/.last_balance 2>/dev/null || echo "10000")

# Run bot
OUTPUT=$(node services/trading-engine.js 2>&1)

# Extract current balance
CURR_BALANCE=$(echo "$OUTPUT" | grep -oP 'Paper Balance: \$\K[0-9.]+' | head -1)

# Save current balance
echo "$CURR_BALANCE" > logs/.last_balance

# Check for important events - only alert on these:
# 1. Trade executed
# 2. Position opened/closed  
# 3. Significant profit/loss (>5%)
# 4. Errors

ALERT=""

if echo "$OUTPUT" | grep -qi "trade executed|position opened|position closed|✅.*SHORT|✅.*LONG"; then
    ALERT="📈 TRADE: "
fi

if [ "$CURR_BALANCE" != "" ] && [ "$PREV_BALANCE" != "" ]; then
    DIFF=$(echo "$CURR_BALANCE - $PREV_BALANCE" | bc 2>/dev/null)
    if (( $(echo "$DIFF > 100 || $DIFF < -100" | bc -l) )); then
        ALERT="💰 BIG MOVE: $\n$DIFF"
    fi
fi

if echo "$OUTPUT" | grep -qiE "error|alert|critical"; then
    ALERT="🚨 ERROR: "
fi

# Only send if important event
if [ "$ALERT" != "" ]; then
    curl -s "https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage" \
        -d "chat_id=8169173316" \
        -d "text=$ALERT

$OUTPUT" > /dev/null 2>&1
fi

# Always log
echo "$(date): Balance: $CURR_BALANCE" >> logs/cron.log
