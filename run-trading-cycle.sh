#!/bin/bash
# CryptoEdge Trading Cycle - runs ML bot then updates dashboard
cd /Users/suren/.openclaw/workspace/crypto-edge

/opt/homebrew/bin/node services/ml/ml-trading-runner.js run
/opt/homebrew/bin/node update-dashboard-data.js
