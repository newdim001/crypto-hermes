/**
 * Partial Fill Handler
 * Manages orders that only partially execute
 */

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Partial fill thresholds
  minFillPercent: 50,           // Accept if >= 50% filled
  retryThresholdPercent: 30,    // Retry if < 30% filled
  
  // Retry settings
  maxRetries: 3,
  retryDelayMs: 2000,           // 2 seconds between retries
  
  // Cancellation rules
  cancelIfPartialAfterMs: 30000, // Cancel if partial after 30s
  cancelIfNoFillAfterMs: 60000,  // Cancel if no fill after 60s
  
  // Adjustment rules
  adjustSizeForPartial: true,    // Adjust strategy to reduced position
  recordPartialHistory: true     // Log partial fills for analysis
};

// ============================================
// PARTIAL FILL DETECTION
// ============================================

function detectPartialFill(orderResponse) {
  // Binance market order response
  const filledQty = parseFloat(orderResponse.executedQty || 0);
  const origQty = parseFloat(orderResponse.origQty || 1);
  const fillPercent = (filledQty / origQty) * 100;
  
  return {
    isPartial: filledQty > 0 && filledQty < origQty,
    isFullyFilled: filledQty >= origQty,
    isNoFill: filledQty === 0,
    filledQty,
    origQty,
    fillPercent,
    status: orderResponse.status,
    orderId: orderResponse.orderId
  };
}

// ============================================
// ORDER STATUS CHECK
// ============================================

async function checkOrderStatus(symbol, orderId, apiKey, secretKey) {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}&recvWindow=5000`;
  const signature = require('crypto').createHmac('sha256', secretKey)
    .update(params).digest('hex');
  
  try {
    const response = await axios.get(`https://api.binance.com/api/v3/order?${params}&signature=${signature}`, {
      headers: { 'X-MBX-APIKEY': apiKey }
    });
    
    return {
      status: response.data.status,
      filledQty: parseFloat(response.data.executedQty),
      origQty: parseFloat(response.data.origQty),
      fills: response.data.fills || []
    };
  } catch (e) {
    console.error(`   ❌ Failed to check order status: ${e.message}`);
    return null;
  }
}

// ============================================
// HANDLER STRATEGIES
// ============================================

async function handleFullyFilled(fillInfo, tradeId) {
  console.log(`   ✅ Order fully filled: ${fillInfo.filledQty}`);
  
  // Update trade record
  await supabase.from('trades').update({
    status: 'OPEN',
    quantity: fillInfo.filledQty,
    notes: `Full fill - ${fillInfo.fills?.[0]?.price || 'market'}`
  }).eq('id', tradeId);
  
  return {
    action: 'OPEN_POSITION',
    filledQty: fillInfo.filledQty,
    message: 'Position opened with full quantity'
  };
}

async function handlePartialFill(fillInfo, tradeId, originalSignal) {
  const fillPercent = fillInfo.fillPercent;
  console.log(`   ⚠️ Partial fill: ${fillPercent.toFixed(1)}% (${fillInfo.filledQty}/${fillInfo.origQty})`);
  
  // Record for analysis
  if (CONFIG.recordPartialHistory) {
    await supabase.from('partial_fills').insert({
      trade_id: tradeId,
      symbol: originalSignal.symbol,
      orig_qty: fillInfo.origQty,
      filled_qty: fillInfo.filledQty,
      fill_percent: fillPercent,
      fill_price: fillInfo.fills?.[0]?.price || null,
      timestamp: new Date().toISOString()
    });
  }
  
  // Decide action based on fill percentage
  if (fillPercent >= CONFIG.minFillPercent) {
    // Accept partial fill and adjust position
    console.log(`   📝 Accepting partial fill (${fillPercent.toFixed(1)}%)`);
    
    const adjustedQty = fillInfo.filledQty;
    
    // Update trade with reduced position
    await supabase.from('trades').update({
      status: 'OPEN',
      quantity: adjustedQty,
      notes: `Partial accept - ${fillPercent.toFixed(1)}% filled`
    }).eq('id', tradeId);
    
    // Adjust stop loss if needed (tighter for smaller position)
    if (CONFIG.adjustSizeForPartial) {
      const newStopPercent = 2 * (fillPercent / 100); // Proportionally tighter
      console.log(`   📉 Adjusted stop loss to ${newStopPercent.toFixed(1)}% for reduced position`);
    }
    
    return {
      action: 'ACCEPT_PARTIAL',
      filledQty: adjustedQty,
      fillPercent,
      message: `Accepted partial fill at ${fillPercent.toFixed(1)}%`
    };
  } else if (fillPercent >= CONFIG.retryThresholdPercent) {
    // Retry for more
    console.log(`   🔄 Retry for additional fill (${fillPercent.toFixed(1)}% so far)`);
    
    return {
      action: 'RETRY',
      filledQty: fillInfo.filledQty,
      remainingQty: fillInfo.origQty - fillInfo.filledQty,
      message: 'Attempting to fill remaining quantity'
    };
  } else {
    // Too small - cancel
    console.log(`   ❌ Fill too small (${fillPercent.toFixed(1)}%) - cancelling`);
    
    return {
      action: 'CANCEL',
      filledQty: fillInfo.filledQty,
      message: 'Cancelled - fill too small'
    };
  }
}

async function handleNoFill(fillInfo, tradeId) {
  console.log(`   ❌ No fill after waiting`);
  
  return {
    action: 'CANCEL',
    filledQty: 0,
    message: 'No execution - cancelled'
  };
}

// ============================================
// MAIN HANDLER
// ============================================

async function handleOrderExecution(orderResponse, tradeId, originalSignal, retryCount = 0) {
  const fillInfo = detectPartialFill(orderResponse);
  
  console.log(`\n📋 Order Fill Status: ${fillInfo.status}`);
  console.log(`   Filled: ${fillInfo.filledQty} / ${fillInfo.origQty} (${fillInfo.fillPercent.toFixed(1)}%)`);
  
  if (fillInfo.isFullyFilled) {
    return await handleFullyFilled(fillInfo, tradeId);
  }
  
  if (fillInfo.isPartial) {
    return await handlePartialFill(fillInfo, tradeId, originalSignal);
  }
  
  if (fillInfo.isNoFill) {
    return await handleNoFill(fillInfo, tradeId);
  }
  
  return { action: 'UNKNOWN', message: 'Unknown fill status' };
}

// ============================================
// WAIT FOR FILL (for market orders)
// ============================================

async function waitForFill(symbol, orderId, timeoutMs = 30000) {
  const apiKey = process.env.BINANCE_API_KEY;
  const secretKey = process.env.BINANCE_SECRET_KEY;
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const status = await checkOrderStatus(symbol, orderId, apiKey, secretKey);
    
    if (!status) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    
    if (status.status === 'FILLED') {
      return {
        filled: true,
        filledQty: status.filledQty,
        origQty: status.origQty,
        fills: status.fills
      };
    }
    
    if (status.status === 'PARTIALLY_FILLED') {
      return {
        filled: false,
        partial: true,
        filledQty: status.filledQty,
        origQty: status.origQty,
        fills: status.fills
      };
    }
    
    if (status.status === 'CANCELED' || status.status === 'EXPIRED' || status.status === 'REJECTED') {
      return {
        filled: false,
        cancelled: true,
        status: status.status
      };
    }
    
    // Wait before next check
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return {
    filled: false,
    timeout: true,
    message: 'Timed out waiting for fill'
  };
}

// ============================================
// POSITION ADJUSTMENT CALCULATOR
// ============================================

function calculateAdjustedPosition(originalQty, fillPercent, riskLevel = 'NORMAL') {
  const filledQty = originalQty * (fillPercent / 100);
  
  // If fill is too small, recommend against taking position
  if (fillPercent < 30) {
    return {
      shouldProceed: false,
      adjustedQty: 0,
      reason: 'Fill too small - increased slippage/risk'
    };
  }
  
  // Adjust risk parameters for smaller position
  let adjustedStopPercent = 2;
  let adjustedTakeProfitPercent = 4;
  
  if (riskLevel === 'HIGH_VOLATILITY') {
    // Widen stops for reduced liquidity
    adjustedStopPercent = adjustedStopPercent * 1.5;
    adjustedTakeProfitPercent = adjustedTakeProfitPercent * 1.2;
  }
  
  return {
    shouldProceed: true,
    originalQty,
    filledQty,
    fillPercent,
    adjustedStopPercent: adjustedStopPercent.toFixed(2),
    adjustedTakeProfitPercent: adjustedTakeProfitPercent.toFixed(2),
    reason: `Position size adjusted from ${originalQty} to ${filledQty.toFixed(4)}`
  };
}

// ============================================
// EXPORT
// ============================================

module.exports = {
  handleOrderExecution,
  detectPartialFill,
  waitForFill,
  calculateAdjustedPosition,
  checkOrderStatus,
  CONFIG
};

// CLI Test
if (require.main === module) {
  // Test partial fill detection
  const testOrder = {
    executedQty: '0.005',
    origQty: '0.01',
    status: 'PARTIALLY_FILLED',
    orderId: 123456
  };
  
  const result = detectPartialFill(testOrder);
  console.log('\n🧪 Test Partial Fill Detection:');
  console.log(JSON.stringify(result, null, 2));
  
  const adjustment = calculateAdjustedPosition(0.01, 65);
  console.log('\n🧪 Test Position Adjustment:');
  console.log(JSON.stringify(adjustment, null, 2));
}
