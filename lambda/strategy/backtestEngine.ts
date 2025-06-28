import { STRATEGY_SETTINGS } from '../config/settings';

// Trade interface represents a single buy or sell action
interface Trade {
  type: 'BUY' | 'SELL'; // Type of trade
  date: string;        // Date of trade
  price: number;       // Price at which trade was executed
  profit?: string;     // Profit percentage (for SELL trades)
  holdingDays?: number;// Number of days position was held (for SELL trades)
}

// Result interface represents the output of the backtest
interface Result {
  trades: Trade[];     // List of all trades
  summary: {
    totalTrades: number;   // Number of completed trades
    totalProfit: string;   // Total profit percentage
    annualReturn: string;  // Annualized return (CAGR)
    beatsFD: boolean;      // Whether return beats fixed deposit
  };
}

// Main backtesting function
export function backtestStrategy(data: any[]): Result {
  // Load config from settings
  const config = {
    takeProfit: STRATEGY_SETTINGS.takeProfit,
    stopLoss: STRATEGY_SETTINGS.stopLoss,
    trailingTrigger: STRATEGY_SETTINGS.trailingTrigger,
    trailingStop: STRATEGY_SETTINGS.trailingStop,
    cooldownDays: STRATEGY_SETTINGS.cooldownDays,
  };

  let inPosition = false; // Whether currently holding a position
  let entry: null | { price: number; date: string; peak: number } = null; // Entry details
  const trades: Trade[] = []; // List of trades
  let totalProfit = 0; // Cumulative profit
  let cooldownUntil: string | null = null; // Cooldown end date

  // Iterate over data, starting from 4th element (need 3 previous days)
  for (let i = 3; i < data.length; i++) {
    const day = data[i];
    const prev1 = data[i - 1];
    const prev2 = data[i - 2];
    const prev3 = data[i - 3];
    if (!day || !prev1 || !prev2 || !prev3) continue;

    const currentDate = new Date(day.date);
    // Skip if in cooldown period
    if (cooldownUntil && currentDate <= new Date(cooldownUntil)) continue;

    // Destructure indicators from current day
    const { rsi, emaFast, emaSlow, macd, macdSignal, adx, atr, bbUpper, avgVolume20, volume } = day;

    // Skip if any required indicator is missing
    if (
      !rsi || !emaFast || !emaSlow || !macd || !macdSignal ||
      !adx || !atr || !bbUpper || !avgVolume20 || !volume
    ) continue;

    // --- Entry (Buy) Logic ---
    // Check for uptrend in RSI over last 3 days
    const rsiUptrend = rsi > prev1.rsi && prev1.rsi > prev2.rsi && prev2.rsi > prev3.rsi;
    // Check for EMA fast > EMA slow
    const emaCrossover = emaFast > emaSlow;
    // Check for bullish MACD
    const macdBullish = macd > macdSignal;

    // Core buy conditions
    const coreConditions = rsiUptrend && emaCrossover && macdBullish;

    // Optional buy conditions
    const optionalConditions = [
      adx > 15, // Trend strength
      (atr / day.close) * 100 > 0.7, // Volatility
      volume > avgVolume20, // Volume spike
      (bbUpper - day.close) / bbUpper > 0.01, // Room to upper Bollinger Band
    ];

    // Count how many optional conditions are met
    const optionalCount = optionalConditions.filter(Boolean).length;

    // Final buy signal: not in position, core conditions, and at least 1 optional
    const buySignal = !inPosition && coreConditions && optionalCount >= 1;

    if (buySignal) {
      inPosition = true;
      entry = {
        price: day.close,
        date: day.date,
        peak: day.close, // Track highest price after entry
      };
      trades.push({
        type: 'BUY',
        date: day.date,
        price: day.close,
      });
      continue;
    }

    // --- Exit (Sell) Logic ---
    if (inPosition && entry) {
      // Calculate profit/loss since entry
      const priceChange = ((day.close - entry.price) / entry.price) * 100;
      // Calculate holding period
      const holdingDays = Math.round(
        (currentDate.getTime() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Update peak price if new high
      if (day.close > entry.peak) entry.peak = day.close;
      // Calculate drawdown from peak
      const drawdown = ((day.close - entry.peak) / entry.peak) * 100;

      // Exit conditions
      const hitStopLoss = priceChange <= -config.stopLoss;
      const hitTakeProfit = priceChange >= config.takeProfit;
      const trailingExit = priceChange >= config.trailingTrigger && drawdown <= -config.trailingStop;
      const bollingerExit = day.close >= bbUpper && rsi < prev1.rsi;
      const rsiExit = rsi > 70 && rsi < prev1.rsi;

      // Should sell if any exit condition is met
      const shouldSell = hitStopLoss || hitTakeProfit || trailingExit || bollingerExit || rsiExit;

      if (shouldSell) {
        inPosition = false;
        trades.push({
          type: 'SELL',
          date: day.date,
          price: day.close,
          profit: `${priceChange.toFixed(2)}%`,
          holdingDays,
        });
        totalProfit += priceChange;
        entry = null;

        // Set cooldown period if configured
        if (config.cooldownDays > 0) {
          cooldownUntil = new Date(currentDate.getTime() + config.cooldownDays * 86400000)
            .toISOString()
            .slice(0, 10);
        } else {
          cooldownUntil = null;
        }
      }
    }
  }

  // --- Annual Return (CAGR) Calculation ---
  const buy = trades.find(t => t.type === 'BUY'); // First buy
  const sell = [...trades].reverse().find(t => t.type === 'SELL'); // Last sell
  let annualReturn = 0;

  if (buy && sell) {
    const start = new Date(buy.date).getTime();
    const end = new Date(sell.date).getTime();
    const years = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
    const profitMultiplier = 1 + totalProfit / 100;

    if (years > 0) {
      annualReturn = Math.pow(profitMultiplier, 1 / years) - 1;
    }
  }

  // Return trades and summary
  return {
    trades,
    summary: {
      totalTrades: trades.length / 2, // Each trade is a buy+sell pair
      totalProfit: `${totalProfit.toFixed(2)}%`,
      annualReturn: `${(annualReturn * 100).toFixed(2)}%`,
      beatsFD: annualReturn * 100 > 7, // Compare to fixed deposit rate
    },
  };
}
