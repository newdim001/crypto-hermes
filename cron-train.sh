#!/bin/bash
# CryptoEdge Model Retraining Cron
# Retrains the ML model daily at 3 AM

cd /Users/suren/.openclaw/workspace/crypto-edge
/opt/homebrew/bin/node services/ml/model-trainer.js >> /Users/suren/.openclaw/logs/crypto-model-train.log 2>&1
