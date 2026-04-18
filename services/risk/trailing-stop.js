// CryptoEdge Trailing Stop-Loss
class TrailingStop {
  calculate(entryPrice, currentPrice, type, trailingPercent = 2) {
    const profit = type === 'LONG' ? (currentPrice - entryPrice) / entryPrice : (entryPrice - currentPrice) / entryPrice;
    const trail = trailingPercent / 100;
    
    let stopPrice;
    if (profit > trail * 2) stopPrice = entryPrice * (1 + trail);
    else if (profit > trail) stopPrice = entryPrice * (1 + trail * 0.5);
    else stopPrice = entryPrice * (1 - (type === 'LONG' ? 0.02 : -0.02));
    
    return { stopPrice: stopPrice.toFixed(2), profit: (profit * 100).toFixed(2) + '%' };
  }
}
module.exports = new TrailingStop();
