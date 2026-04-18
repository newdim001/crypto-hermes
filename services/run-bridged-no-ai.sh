#!/bin/bash
# Run bridged engine with AI disabled - prioritize Python bot signals

cd "$(dirname "$0")"

echo "🚀 CRYPTOEDGE BRIDGED ENGINE - AI DISABLED"
echo "=========================================="

# Disable AI trading
export USE_AI_TRADING=false

# Step 1: Run signal bridge
echo "🔗 Running signal bridge..."
node signal-bridge.js

# Step 2: Run bridged engine
echo "🚀 Running bridged engine (AI disabled)..."
node core/smart-engine-bridged.js --run-bridge

echo "✅ Bridged engine complete"