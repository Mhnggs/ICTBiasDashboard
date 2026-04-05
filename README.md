# ICT Bias Dashboard

Real-time Forex Smart Money Concepts (SMC/ICT) Bias Dashboard. Fetches live forex data from the Twelve Data API, runs algorithmic SMC analysis, and displays directional bias for day trading.

## Features

- **SMC Analysis**: HTF trend detection, Break of Structure, Order Blocks, Fair Value Gaps, Asian Range, Liquidity Pools
- **Live Data**: Real-time forex data via Twelve Data API
- **6 Major Pairs**: EUR/USD, GBP/USD, USD/JPY, GBP/JPY, AUD/USD, NZD/USD
- **Candlestick Charts**: TradingView lightweight-charts with OB/FVG overlays
- **Session Tracking**: Asian, London, New York sessions with killzone indicators
- **Risk Calculator**: Position sizing based on account size, risk %, and R:R ratio
- **Dark Terminal Theme**: Professional trading dashboard aesthetic

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install && cd client && npm install && cd ..
   ```
3. Copy `.env.example` to `.env` and add your [Twelve Data API key](https://twelvedata.com/signup):
   ```
   TWELVE_DATA_API_KEY=your_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

The Express backend runs on port 3001 and the React frontend on port 5173.

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: React (Vite) + Tailwind CSS
- **Charts**: lightweight-charts (TradingView)
- **Data**: Twelve Data API

## API Rate Limits

Free tier: 8 credits/minute, 800/day. The app caches results for 5 minutes and adds delays between pair fetches.
