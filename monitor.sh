#!/bin/bash
cd ~/.openclaw/workspace/crypto-edge

# Run bot and capture
OUTPUT=$(node services/trading-engine.js 2>&1)

# Log output
echo "$(date): $OUTPUT" >> ~/.openclaw/workspace/crypto-edge/logs/cron-monitor.log

# Check for alerts - send to Telegram if important
if echo "$OUTPUT" | grep -qiE "trade executed|position opened|position closed|profit|loss|error|alert"; then
    # Send alert via Telegram
    curl -s "https://api.telegram.org/bot8487340007:AAGUdMxXiUrq5OlNZbQeitQzQwHDJLPRmhU/sendMessage" \
        -d "chat_id=8169173316" \
        -d "text=🤖 CryptoEdge Alert:
        
$OUTPUT"
fi
