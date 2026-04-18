#!/bin/bash
# CryptoEdge Cron Setup Script

echo "Setting up CryptoEdge cron jobs..."

# Create log directories
mkdir -p ~/.openclaw/workspace/crypto-edge/logs

# ML Trading Cycle - Every hour at minute 0
(crontab -l 2>/dev/null | grep -v "ml-trading-runner.js"; echo "0 * * * * cd ~/.openclaw/workspace/crypto-edge && node services/ml/ml-trading-runner.js run >> ~/.openclaw/workspace/crypto-edge/logs/trading.log 2>&1") | crontab -

# Market Data Collection - Every 30 minutes
(crontab -l 2>/dev/null | grep -v "data-collector.js"; echo "*/30 * * * * cd ~/.openclaw/workspace/crypto-edge && node services/data-collector.js >> ~/.openclaw/workspace/crypto-edge/logs/data.log 2>&1") | crontab -

# Performance Report - Daily at midnight
(crontab -l 2>/dev/null | grep -v "performance-report.js"; echo "0 0 * * * cd ~/.openclaw/workspace/crypto-edge && node services/performance-report.js >> ~/.openclaw/workspace/crypto-edge/logs/performance.log 2>&1") | crontab -

# Weekly Performance Report - Every Monday at 7 AM
(crontab -l 2>/dev/null | grep -v "weekly-report.js"; echo "0 7 * * 1 cd ~/.openclaw/workspace/crypto-edge && node services/weekly-report.js >> ~/.openclaw/workspace/crypto-edge/logs/weekly-report.log 2>&1") | crontab -

# Backup - Daily at 3 AM
(crontab -l 2>/dev/null | grep -v "backup-service.js"; echo "0 3 * * * cd ~/.openclaw/workspace/crypto-edge && node services/testing/backup-service.js daily >> ~/.openclaw/workspace/crypto-edge/logs/backup.log 2>&1") | crontab -

echo ""
echo "✅ CryptoEdge cron jobs installed:"
crontab -l | grep crypto-edge

echo ""
echo "Log files will be created in:"
echo "  ~/.openclaw/workspace/crypto-edge/logs/"
