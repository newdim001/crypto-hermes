#!/bin/bash
# Auto-Research Runner for OpenClaw
# Runs research experiments nightly and reports findings

LOG_FILE="$HOME/.openclaw/workspace/crypto-edge/logs/auto-research.log"
RESEARCH_SCRIPT="$HOME/.openclaw/workspace/crypto-edge/auto-research-telegram.js"

echo "🌙 Auto-Research started at $(date)" >> "$LOG_FILE"

# Run the research
cd "$HOME/.openclaw/workspace/crypto-edge"
node "$RESEARCH_SCRIPT" status >> "$LOG_FILE" 2>&1

# Check if we should run experiments
EXPERIMENTS=$(node "$RESEARCH_SCRIPT" status 2>/dev/null | grep "Experiments:" | awk '{print $2}')

echo "📊 Current experiments: $EXPERIMENTS" >> "$LOG_FILE"

# If less than 50 experiments, run more
if [ "$EXPERIMENTS" -lt 50 ]; then
    echo "🚀 Running 10 more experiments..." >> "$LOG_FILE"
    node "$RESEARCH_SCRIPT" run >> "$LOG_FILE" 2>&1
fi

echo "✅ Auto-Research completed at $(date)" >> "$LOG_FILE"
