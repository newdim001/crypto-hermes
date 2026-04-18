// Slippage Control
class SlippageControl {
  estimate(size, depth) { return Math.min((size/depth)*0.01, 0.005); }
  shouldUseMarket(conf, vol) { return conf > 80 && vol < 2; }
}
module.exports = new SlippageControl();
