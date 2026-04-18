#!/bin/bash
# CryptoHermes Trading Cycle - Hermes AI Controlled
# Runs ML bot and updates dashboard

cd ~/.hermes/crypto-hermes

echo "=== CryptoHermes Trading Cycle ==="
echo "Started at: $(date)"
echo "Instance: Hermes-controlled"
echo ""

# Run ML trading runner
/opt/homebrew/bin/node services/ml/ml-trading-runner.js run

# Update dashboard data
/opt/homebrew/bin/node update-dashboard-data.js

echo ""
echo "=== Cycle Complete at: $(date) ==="
