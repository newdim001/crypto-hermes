#!/bin/bash
# CryptoHermes Status Check

cd ~/.hermes/crypto-hermes

echo "=== CryptoHermes Status ==="
echo "Time: $(date)"
echo ""

# Check if trading engine is running
ps aux | grep -i "trading-engine" | grep -v grep | head -3 || echo "Trading engine: Not running"

# Check last trade
echo ""
echo "--- Recent Positions ---"
node -e "
const fs = require('fs');
const state = JSON.parse(fs.readFileSync('data/trading-state.json', 'utf8'));
console.log('Balance:', '\$' + (state.balance || 0).toFixed(2));
console.log('Open Positions:', state.openPositions ? state.openPositions.length : 0);
if (state.openPositions && state.openPositions.length > 0) {
  state.openPositions.forEach(p => {
    console.log('  ' + p.symbol + ': ' + p.side + ' @ ' + p.entryPrice + ' | P&L: ' + (p.unrealizedPnl || 0).toFixed(2));
  });
}
" 2>/dev/null || echo "No trading state found"

echo ""
echo "--- Brain Weights ---"
node -e "
const fs = require('fs');
const brain = JSON.parse(fs.readFileSync('data/brain.json', 'utf8'));
Object.entries(brain.weights).sort((a,b) => b[1]-a[1]).slice(0,5).forEach(([k,v]) => console.log('  ' + k + ': ' + v));
" 2>/dev/null || echo "No brain data found"

echo ""
echo "--- Last Log Lines ---"
tail -5 logs/cron.log 2>/dev/null || echo "No logs found"
