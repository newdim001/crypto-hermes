# SKILL: Sentiment Collector

## Purpose
Gather news and social media sentiment to gauge market mood.

## Data Sources

### News APIs
- CryptoPanic
- CoinGecko News
- Bing News Search
- NewsAPI

### Social Media
- Twitter/X (via API)
- Reddit (cryptocurrency subreddits)
- Telegram groups

### On-Chain Data
- Exchange inflow/outflow
- Whale transactions
- Exchange reserves

## Sentiment Analysis

### Metrics Calculated
- **Fear & Greed Index** - 0-100 scale
- **News Sentiment** - Positive/Negative/Neutral score
- **Social Volume** - Mention count trend
- **Whale Activity** - Large transaction detection

### Fear & Greed Components
- Volatility (25%)
- Market Momentum/Volume (25%)
- Social Media (15%)
- Surveys (15%)
- Dominance (10%)
- Trends (10%)

## Alert Triggers
- Fear < 25 (Extreme Fear - Buy signal?)
- Greed > 75 (Extreme Greed - Sell signal?)
- Sudden spike in negative news
- Unusual social volume

## Database Storage
- Table: `sentiment_data`
- Columns: symbol, source, sentiment_score, news_count, whale_alerts

## Usage
```javascript
const sentiment = await analyzeSentiment('BTC')
// Returns: { fear_greed: 45, sentiment: 'neutral', news: [...], alerts: [] }
```

## Used By
- ai-signal-generator
- alert-manager
