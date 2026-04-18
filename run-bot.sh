#!/bin/bash
cd /Users/suren/.openclaw/workspace/crypto-edge
while true; do
    node services/trading-engine.js >> logs/cron.log 2>&1
    echo "--- Restarting at $(date) ---" >> logs/cron.log
    sleep 900  # 15 minutes
done
