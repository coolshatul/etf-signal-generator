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

## 🛡️ Signal Integrity

The scanners only act on **completed candles**, never the currently-forming bar:

- **Daily** scans run at 9:00 AM IST (previous close) and 4:00 PM IST (today's final candle).
- **Weekly** scans use the last completed week, so the number is stable Monday–Friday.
- **Intraday** bars are only used after their full duration has elapsed.
- Invalid/zero/null Yahoo rows are dropped, timestamps are deduped and sorted, and stale series are rejected. Stock candles without volume are discarded rather than treated as zero-volume bars.
- Alerts fire only on **new** signals. A position that is already open is not re-alerted every run.
- Performance tracking checks intrabar **high/low** (not just the close), handles long and short signals, and closes stale signals after a per-strategy holding period.

### Signal identity and dedupe

Every stored signal has an immutable key:

```
signalKey = strategy | timeframe | symbol | direction | eventAt
```

- The same candle (or the same EMA cross bar) can never alert twice, even after it is stopped out or hits target.
- Same-day BUY and SELL signals can coexist, and a crossover in the opposite direction closes the open position as `REVERSAL`.
- If the dedupe lookup cannot reach MongoDB, alerts are **suppressed** rather than risk duplicates.
- Cooldowns: bullish daily 1 day, crossover 60 minutes, watchlist none.

### Trade validation

A scored candidate is not a signal until its levels make sense:

- BUY: `stop < entry < target`; SELL: `target < entry < stop`.
- Minimum reward:risk **1.5**.
- Stop distance between **0.5%** and **12%** of entry.
- Rejected candidates are logged with a reason and never alerted.

### Costs and corporate actions

- Performance is stored gross and net. Net subtracts **0.35%** round-trip costs plus **5 bps** slippage per side.
- `performancePercent` remains the net number for backwards compatibility.
- Yahoo split events adjust stored entry/stop/target into post-split terms before evaluating levels.
- A >35% gap with no split event is flagged `NEEDS_REVIEW` instead of being treated as a stop.

### Alert channels

Email is the primary alert channel. Telegram is optional and **off by default**:

| Variable | Default | Meaning |
|----------|---------|---------|
| `EMAIL_ALERTS_ENABLED` | `true` | Send the scan summary by email |
| `TELEGRAM_ALERTS_ENABLED` | `false` | Set to `true` to resume Telegram broadcasts |

Signal logging to MongoDB always happens, regardless of channel settings.

### Email layout

Each email is a single scannable summary:

- Header with the scan name, date and IST time.
- Summary stats (signal count, BUY/SELL split, average R:R, average stop risk).
- One row per stock: action, entry/stop/target, risk %, reward % and a chart link.
- A short “how to use this email” box explaining what was validated and what to do next.
- Watchlist emails are labelled **not a BUY signal** and show no trade levels.

A **weekly performance email** is sent every Saturday at 10:00 IST. It reports
closed trades for the week, win rate, average net return, best/worst trades,
open positions, and a per-strategy breakdown. Backlog reconciliations from the
migration are excluded so the first report is not inflated.

### Weekly pullback watchlist

The 36-week EMA scan is a **watchlist**, not a BUY signal. It is stored as
`strategy: WEEKLY_PULLBACK_WATCHLIST`, `signal: HOLD`, `status: WATCHLIST`,
and is excluded from trade performance and win-rate calculations.

Run the deterministic tests with:

```bash
npm run test-indicators
npm run test-signal-logic
```

### Migrating existing signal data

The old `{ symbol, date, strategy }` unique index must be replaced before
deploying the new writers. Preview first, then apply:

```bash
npm run migrate-signal-identity -- --dry-run
npm run migrate-signal-identity
```

The migration drops the legacy index, backfills `signalKey`/`entryAt`/`timeframe`,
converts old EMA36 rows into closed watchlist rows, and recreates the indexes.

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
| `npm run test-indicators` | Runs deterministic indicator/session tests |
| `npm run test-signal-logic` | Runs signal-identity, trade-level, cost and split tests |
| `npm run migrate-signal-identity` | Migrates signals to the new `signalKey` schema (`-- --dry-run` to preview) |
| `npm run repair-signal-data` | Repairs legacy statuses/exit reasons and marks backlog closes (`-- --dry-run` to preview) |
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