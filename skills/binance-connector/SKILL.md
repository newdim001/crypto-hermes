# SKILL: Binance Connector

## Purpose
Connect to Binance exchange API for crypto trading operations.

## Capabilities
- Fetch market data (prices, klines, order book)
- Place orders (market, limit, stop-loss)
- Check account balance
- Get open positions
- Cancel orders

## API Endpoints Used
- `/api/v3/klines` - Klines/Candlesticks
- `/api/v3/ticker/price` - Current prices
- `/api/v3/order` - Place orders
- `/api/v3/account` - Account info
- `/api/v3/openOrders` - Open orders

## Configuration Required
- BINANCE_API_KEY
- BINANCE_SECRET_KEY
- Testnet for paper trading: https://testnet.binance.vision

## Functions
```javascript
// Get current price
async function getPrice(symbol: string): Promise<number>

// Get klines (candlestick) data
async function getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]>

// Place market order
async function placeMarketOrder(symbol: string, side: 'BUY'|'SELL', quantity: number): Promise<Order>

// Place limit order
async function placeLimitOrder(symbol: string, side: 'BUY'|'SELL', quantity: number, price: number): Promise<Order>

// Get account balance
async function getBalance(): Promise<Balance>

// Cancel order
async function cancelOrder(symbol: string, orderId: number): Promise<void>
```

## Usage
Used by: technical-analyst, paper-trader, live-trader
