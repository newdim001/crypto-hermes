#!/usr/bin/env node
/**
 * Auto Parameter Updater
 * Analyzes trade performance and automatically adjusts learning parameters
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Default parameters (will be updated based on performance)
const DEFAULT_PARAMS = {
  // Entry conditions
  min_confidence: 75,
  min_volume_ratio: 0.8,
  max_rsi: 75,
  min_rsi: 30,
  
  // Risk management
  stop_loss_pct: 1.5,
  take_profit_pct: 3.75,
  max_daily_loss_pct: 2,
  max_daily_trades: 2,
  
  // Time-based optimizations
  best_hours_utc: [9], // 9:00 UTC = 69.8% win rate
  avoid_hours_utc: [0, 1, 2, 3, 4, 5, 6, 23],
  
  // Market regime preferences
  preferred_regimes: ['trending'],
  avoid_regimes: ['ranging', 'choppy'],
  
  // Indicator weights (learned from performance)
  indicator_weights: {
    rsi: 0.25,
    volume: 0.20,
    bollinger: 0.15,
    ema: 0.15,
    macd: 0.10,
    time_of_day: 0.10,
    market_regime: 0.05
  }
};

async function analyzeTradePerformance() {
  console.log('═'.repeat(50));
  console.log('🧠 AUTO PARAMETER UPDATER');
  console.log('═'.repeat(50));
  
  // Get recent trades (last 100)
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('bot_mode', 'ml-paper')
    .order('created_at', { ascending: false })
    .limit(100);
    
  if (error) {
    console.log('Error fetching trades:', error.message);
    return DEFAULT_PARAMS;
  }
  
  if (!trades || trades.length < 10) {
    console.log('⚠️ Not enough trades for analysis (need ≥10)');
    return DEFAULT_PARAMS;
  }
  
  console.log(`📊 Analyzing ${trades.length} trades...\n`);
  
  // Analyze performance by different factors
  const analysis = {
    by_hour: {},
    by_rsi: {},
    by_volume: {},
    by_regime: {},
    by_bollinger: {},
    overall: { total: 0, profitable: 0, total_pnl: 0 }
  };
  
  trades.forEach(trade => {
    const hour = new Date(trade.created_at).getUTCHours();
    const profitable = trade.pnl > 0;
    
    // Group by hour
    analysis.by_hour[hour] = analysis.by_hour[hour] || { total: 0, profitable: 0, total_pnl: 0 };
    analysis.by_hour[hour].total++;
    if (profitable) analysis.by_hour[hour].profitable++;
    analysis.by_hour[hour].total_pnl += trade.pnl || 0;
    
    // Group by RSI range (if available)
    if (trade.entry_rsi) {
      const rsiRange = Math.floor(trade.entry_rsi / 10) * 10;
      analysis.by_rsi[rsiRange] = analysis.by_rsi[rsiRange] || { total: 0, profitable: 0 };
      analysis.by_rsi[rsiRange].total++;
      if (profitable) analysis.by_rsi[rsiRange].profitable++;
    }
    
    // Group by volume (if available)
    if (trade.volume_ratio) {
      const volRange = trade.volume_ratio < 0.5 ? 'low' : trade.volume_ratio < 1 ? 'medium' : 'high';
      analysis.by_volume[volRange] = analysis.by_volume[volRange] || { total: 0, profitable: 0 };
      analysis.by_volume[volRange].total++;
      if (profitable) analysis.by_volume[volRange].profitable++;
    }
    
    // Overall stats
    analysis.overall.total++;
    if (profitable) analysis.overall.profitable++;
    analysis.overall.total_pnl += trade.pnl || 0;
  });
  
  // Calculate win rates
  console.log('📈 PERFORMANCE ANALYSIS:');
  
  const overallWinRate = (analysis.overall.profitable / analysis.overall.total * 100).toFixed(1);
  console.log(`Overall: ${analysis.overall.total} trades | ${overallWinRate}% win rate | P&L: $${analysis.overall.total_pnl.toFixed(2)}`);
  
  // Find best performing hours
  console.log('\n🕐 BEST TRADING HOURS (UTC):');
  const bestHours = [];
  Object.keys(analysis.by_hour).forEach(hour => {
    const data = analysis.by_hour[hour];
    if (data.total >= 3) { // Minimum sample size
      const winRate = (data.profitable / data.total * 100).toFixed(1);
      const avgPnl = data.total_pnl / data.total;
      console.log(`  ${hour}:00 - ${data.total} trades | ${winRate}% win | Avg: $${avgPnl.toFixed(2)}`);
      
      if (winRate > 55) { // Good win rate
        bestHours.push(parseInt(hour));
      }
    }
  });
  
  // Find best RSI range
  console.log('\n📊 BEST RSI RANGES:');
  let bestRsiMin = 30;
  let bestRsiMax = 70;
  Object.keys(analysis.by_rsi).sort((a,b) => a-b).forEach(rsi => {
    const data = analysis.by_rsi[rsi];
    if (data.total >= 5) {
      const winRate = (data.profitable / data.total * 100).toFixed(1);
      console.log(`  RSI ${rsi}-${parseInt(rsi)+9}: ${data.total} trades | ${winRate}% win`);
      
      if (winRate > 60 && parseInt(rsi) >= 30 && parseInt(rsi) <= 60) {
        bestRsiMin = parseInt(rsi);
        bestRsiMax = parseInt(rsi) + 9;
      }
    }
  });
  
  // Find best volume range
  console.log('\n📈 BEST VOLUME RANGES:');
  let bestVolumeMin = 0.8;
  Object.keys(analysis.by_volume).forEach(vol => {
    const data = analysis.by_volume[vol];
    if (data.total >= 5) {
      const winRate = (data.profitable / data.total * 100).toFixed(1);
      console.log(`  ${vol.toUpperCase()} volume: ${data.total} trades | ${winRate}% win`);
      
      if (winRate > 60 && vol === 'high') {
        bestVolumeMin = 1.0;
      } else if (winRate > 55 && vol === 'medium') {
        bestVolumeMin = 0.8;
      }
    }
  });
  
  // Generate updated parameters
  const updatedParams = {
    ...DEFAULT_PARAMS,
    min_confidence: Math.max(70, Math.min(85, parseFloat(overallWinRate))),
    min_volume_ratio: bestVolumeMin,
    max_rsi: bestRsiMax,
    min_rsi: bestRsiMin,
    best_hours_utc: bestHours.length > 0 ? bestHours : [9], // Default to 9:00 UTC if none found
    last_updated: new Date().toISOString(),
    analysis_based_on: `${trades.length} trades`,
    overall_win_rate: parseFloat(overallWinRate)
  };
  
  // Adjust indicator weights based on what's working
  if (bestRsiMax < 70) {
    updatedParams.indicator_weights.rsi = 0.30; // Increase RSI weight if lower ranges work better
  }
  
  if (bestVolumeMin > 0.8) {
    updatedParams.indicator_weights.volume = 0.25; // Increase volume weight if high volume works
  }
  
  console.log('\n⚙️ UPDATED PARAMETERS:');
  console.log(JSON.stringify(updatedParams, null, 2));
  
  // Save to config file
  const configPath = path.join(__dirname, 'ml-config.json');
  fs.writeFileSync(configPath, JSON.stringify(updatedParams, null, 2));
  
  console.log(`\n✅ Parameters saved to: ${configPath}`);
  
  // Also update the trading engine config
  const engineConfigPath = path.join(__dirname, '..', 'config', 'trading-config.json');
  if (fs.existsSync(engineConfigPath)) {
    const engineConfig = JSON.parse(fs.readFileSync(engineConfigPath, 'utf8'));
    engineConfig.ai_params = updatedParams;
    fs.writeFileSync(engineConfigPath, JSON.stringify(engineConfig, null, 2));
    console.log(`✅ Trading engine config updated`);
  }
  
  console.log('\n' + '═'.repeat(50));
  return updatedParams;
}

// Run analysis
analyzeTradePerformance().catch(console.error);