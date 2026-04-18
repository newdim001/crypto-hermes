// CryptoEdge Fee Calculator - Binance Fee Structure
class FeeCalculator {
  constructor() {
    this.FDUSD_PAIRS = ['BTCFDUSD', 'ETHFDUSD', 'BNBFDUSD', 'SOLFDUSD', 'XRPFDUSD', 'DOGEFDUSD', 'LINKFDUSD'];
    this.spotMaker = 0.001;
    this.spotTaker = 0.001;
    this.futuresMaker = 0.0002;
    this.futuresTaker = 0.0005;
    this.bnbDiscount = 0.25; // 25% for spot
    this.bnbDiscountFutures = 0.10; // 10% for futures
  }
  
  // Get spot fee rate
  getSpotRate(symbol, orderType, useBnb = false) {
    let rate = orderType === 'maker' ? this.spotMaker : this.spotTaker;
    
    // FDUSD pairs - maker = 0
    if (this.FDUSD_PAIRS.includes(symbol.toUpperCase()) && orderType === 'maker') {
      rate = 0;
    }
    
    // BNB discount
    if (useBnb) {
      rate *= (1 - this.bnbDiscount);
    }
    
    return rate;
  }
  
  // Calculate spot trade fee
  calculateSpotFee(amount, price, symbol, orderType, useBnb = false) {
    const tradeValue = amount * price;
    const rate = this.getSpotRate(symbol, orderType, useBnb);
    return tradeValue * rate;
  }
  
  // Calculate futures fees
  calculateFuturesFee(principal, leverage, useBnb = false) {
    const positionSize = principal * leverage;
    let rate = this.futuresTaker;
    
    if (useBnb) rate *= (1 - this.bnbDiscountFutures);
    
    const openFee = positionSize * rate;
    const closeFee = positionSize * rate;
    
    return { openFee, closeFee, total: openFee + closeFee, positionSize };
  }
  
  // Estimate funding fee
  estimateFundingFee(positionSize, hoursHeld, fundingRate = 0.0001) {
    const fundingEvents = Math.floor(hoursHeld / 8);
    return positionSize * fundingRate * fundingEvents;
  }
  
  // Total trade cost (with funding for futures)
  totalCost(trade) {
    const { type, amount, price, symbol, orderType, leverage = 1, hoursHeld = 0, fundingRate = 0.0001, useBnb = false } = trade;
    
    if (type === 'spot') {
      const fee = this.calculateSpotFee(amount, price, symbol, orderType, useBnb);
      return { fee, asPercent: (fee / (amount * price)) * 100 };
    } else {
      const { total: tradingFees, positionSize } = this.calculateFuturesFee(amount, leverage, useBnb);
      const fundingFees = this.estimateFundingFee(positionSize, hoursHeld, fundingRate);
      const total = tradingFees + fundingFees;
      return { tradingFees, fundingFees, total, asPercent: (total / amount) * 100, positionSize };
    }
  }
  
  // Pre-trade check - should we proceed?
  shouldProceed(trade, minProfitPercent = 0.3) {
    const cost = this.totalCost(trade);
    const minRequired = minProfitPercent + cost.asPercent;
    
    return {
      proceed: trade.expectedProfitPercent >= minRequired,
      costPercent: cost.asPercent.toFixed(3) + '%',
      minRequired: minRequired.toFixed(3) + '%',
      expectedProfit: trade.expectedProfitPercent + '%'
    };
  }
}

module.exports = new FeeCalculator();
