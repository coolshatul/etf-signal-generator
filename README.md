# 📈 ETF Swing Trading Signal Generator

An automated swing trading signal generator for Indian ETFs using Node.js, AWS Lambda, and Telegram alerts. It analyzes technical indicators (RSI, EMA, MACD, etc.), runs backtests, and sends daily signals like **BUY**, **SELL**, or **HOLD**.

---

## 🚀 Features

- 🧠 Backtested strategy using RSI, EMA, MACD, ADX, ATR, Volume
- 💬 Telegram alerts with previous signal context
- 📊 Signal includes Backtest stats: Win Rate, Profit, CAGR
- 🕒 Runs daily (Mon–Fri) via scheduled AWS Lambda
- ☁️ Fully deployable with AWS CDK
- 🧪 Local test runner to debug strategies

---

# 🧠 Strategy Logic

A smart swing-trading strategy powered by momentum and trend indicators — perfect for ETF traders looking to systematize entries and exits. Get real-time alerts, backtest insights, and clean signal logic.

---

## 🔍 Signal Logic

### ✅ **BUY When:**

- RSI is **trending up** over the last **3 days**
- **EMA(9) > EMA(21)** (bullish crossover)
- **MACD crossover**: `MACD > Signal`
- **At least 1** of the following filters passed:
  - **ADX** (strong trend)
  - **ATR%** (volatility spike)
  - **Volume** (above-average activity)
  - **Bollinger Band breakout**

---

### ❌ **SELL When:**

- 🎯 **Target Profit** reached (e.g., **+8%**)
- 🛑 **Stop Loss** triggered (e.g., **-3%**)
- 🔄 **Trailing Stop Loss** triggered after a **5%** gain
- 📉 **Reversal Detected**:
  - RSI overbought / divergence
  - Bollinger Band reversal

---

## 🔔 Telegram Alert Format

Sample real-time alert for Telegram bots:

🚨 Swing Trade Signal Alert 🚨
📅 Date: 2025-06-28
📊 ETF: NIFTYBEES

📍 Current Signal: BUY
📦 Previous Signal: SELL on 2025-06-25 at ₹283.41 (+1.61%)
💰 Price: ₹287.96

📈 Indicators:
- RSI: 65.20 📈 (Bullish)
- EMA(9): 283.03
- EMA(21): 280.64

🎯 Strategy Settings:
- Target Profit: 8%
- Stop Loss: 3%
- Trailing SL: 2% after 5% gain

🧠 Why this signal?
Backtest triggered BUY today at ₹287.96

📊 Backtest Summary:
- Total Trades: 18
- Win Rate: 62.5%
- Profit: 24.2%
- Annual Return: 14.5%
- Backtest Days: 365

⚠️ This is not financial advice. Always do your own research.




---

## 🧰 Scripts

| Command             | Description                              |
|---------------------|------------------------------------------|
| `npm run deploy`    | Deploys Lambda using AWS CDK             |
| `npm run test-local`| Runs strategy locally with test ETF      |
| `npm run cdk`       | Synthesizes the CDK stack                |

---

## 📌 Future Enhancements

- 🤖 Telegram **command bot** (e.g., `/signal NIFTYBEES`)
- 📧 Email alerts via **AWS SES**
- 🧾 **MongoDB** storage for historical signals
- 📊 **React dashboard** for live + historical data

---

## 🛡️ Disclaimer

This tool is for **educational purposes only**. It is not financial advice.  
Use at your own risk and always perform your own due diligence.

---

## 📬 Contact

**Made by [Shatul Patil](https://github.com/coolshatul)** — feel free to fork, contribute, or suggest improvements.

---

⭐️ *If you like this project, don't forget to star it on GitHub!*