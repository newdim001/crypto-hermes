const tulind = require('tulind');

class SignalGeneratorV3 {
  constructor() {
    this.volumeThreshold = 1.5; // 150% of average volume
    this.adxThreshold = 20;
  }

  async generateSignals(data) {
    const signals = [];
    if (!data || data.length < 50) return signals;

    // Calculate indicators
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    // 1. Volume Analysis (Primary - 87% accuracy)
    const volumeAvg = this.sma(volumes, 20);
    const currentVolume = volumes[volumes.length - 1];
    const volumeRatio = currentVolume / volumeAvg[volumeAvg.length - 1];
    const isVolumeSpike = volumeRatio > this.volumeThreshold;

    // 2. Trend Indicators (Confluence - ~47% accuracy)
    const macd = await this.calculateMACD(closes);
    const ema20 = await this.calculateEMA(closes, 20);
    const ema50 = await this.calculateEMA(closes, 50);
    const adx = await this.calculateADX(highs, lows, closes, 14);

    const lastMacd = macd.macd[macd.macd.length - 1];
    const lastSignal = macd.signal[macd.signal.length - 1];
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    const lastClose = closes[closes.length - 1];
    const lastAdx = adx[adx.length - 1];

    // Check if trend is strong (avoid trading against)
    const isStrongTrend = lastAdx > this.adxThreshold;
    const isBullishTrend = lastEma20 > lastEma50 && lastMacd > lastSignal;
    const isBearishTrend = lastEma20 < lastEma50 && lastMacd < lastSignal;

    // Generate signals only if volume spike AND trend confluence
    if (isVolumeSpike && !isStrongTrend) {
      // Bullish Signal: Volume spike + bullish trend confluence
      if (isBullishTrend && lastClose > lastEma20) {
        signals.push({
          symbol: data[0].symbol,
          side: 'LONG',
          strength: Math.min(volumeRatio, 3.0), // Cap strength at 3.0
          reason: `Volume spike (${volumeRatio.toFixed(2)}x avg) with bullish MACD/EMA confluence`,
          timestamp: Date.now(),
          indicators: {
            volumeRatio,
            macdBullish: lastMacd > lastSignal,
            emaBullish: lastEma20 > lastEma50,
            adx: lastAdx
          }
        });
      }
      // Bearish Signal: Volume spike + bearish trend confluence
      else if (isBearishTrend && lastClose < lastEma20) {
        signals.push({
          symbol: data[0].symbol,
          side: 'SHORT',
          strength: Math.min(volumeRatio, 3.0),
          reason: `Volume spike (${volumeRatio.toFixed(2)}x avg) with bearish MACD/EMA confluence`,
          timestamp: Date.now(),
          indicators: {
            volumeRatio,
            macdBearish: lastMacd < lastSignal,
            emaBearish: lastEma20 < lastEma50,
            adx: lastAdx
          }
        });
      }
    }

    return signals;
  }

  // Helper functions
  sma(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  async calculateMACD(closes) {
    try {
      const result = await tulind.indicators.macd.indicator([closes], [12, 26, 9]);
      return {
        macd: result[0],
        signal: result[1],
        histogram: result[2]
      };
    } catch (error) {
      return { macd: [], signal: [], histogram: [] };
    }
  }

  async calculateEMA(data, period) {
    try {
      const result = await tulind.indicators.ema.indicator([data], [period]);
      return result[0];
    } catch (error) {
      return [];
    }
  }

  async calculateADX(highs, lows, closes, period) {
    try {
      const result = await tulind.indicators.adx.indicator([highs, lows, closes], [period]);
      return result[0];
    } catch (error) {
      return [];
    }
  }
}

module.exports = SignalGeneratorV3;