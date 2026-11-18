import { StrategySettings } from '../types';

export const STRATEGY_SETTINGS: StrategySettings = {
    rsiPeriod: 14,
    emaFastPeriod: 9,
    emaSlowPeriod: 21,
    // trailing & risk config
    takeProfit: 8, // Exit if gain hits 8%
    stopLoss: 3, // Exit if loss hits 3%
    trailingTrigger: 5, // Start trailing after 5% gain
    trailingStop: 2, // Exit if drop from peak is >2%
    cooldownDays: 0, // Optional cooldown after SELL
    backtestDays: 365, // Use 365 days of data for backtesting
};

// Live-signal risk gates. These are separate from the backtest settings above.
export const RISK_LIMITS = {
    minRiskReward: 1.5,
    minStopPercent: 0.5,
    maxStopPercent: 12,
    maxOpenAgeDays: 45,
};

// Delivery round-trip cost estimate: brokerage, STT, exchange charges, GST and
// stamp duty. Slippage is applied per side.
export const COST_MODEL = {
    roundTripCostPercent: 0.35,
    slippageBpsPerSide: 5,
};

// Maximum number of calendar days a signal may stay open before it is closed
// at the latest completed price.
export const MAX_HOLDING_DAYS: Record<string, number> = {
    BULLISH_SCAN: 30,
    WEEKLY_PULLBACK_WATCHLIST: 10,
    EMA_CROSSOVER_SCAN: 15,
    // Legacy strategy name retained for historical rows.
    EMA36_SCAN: 10,
};
export const DEFAULT_MAX_HOLDING_DAYS = 30;

// Per-strategy alert cooldown after a signal is logged. Event keys already stop
// the exact same cross from re-alerting; the cooldown also prevents rapid
// direction flip-flops.
export const DEDUPE_COOLDOWN_MS: Record<string, number> = {
    BULLISH_SCAN: 24 * 60 * 60 * 1000,
    EMA_CROSSOVER_SCAN: 60 * 60 * 1000,
    WEEKLY_PULLBACK_WATCHLIST: 0,
    EMA36_SCAN: 0,
};

// Alert delivery channels. Email is the primary channel; Telegram is off by
// default because it is optional. Set TELEGRAM_ALERTS_ENABLED=true to restore
// Telegram broadcasts, and EMAIL_ALERTS_ENABLED=false to silence email.
export const ALERT_CHANNELS = {
    email: process.env.EMAIL_ALERTS_ENABLED !== 'false',
    telegram: process.env.TELEGRAM_ALERTS_ENABLED === 'true',
};

// You can also export supported ETF symbols here if needed
export const SUPPORTED_ETFS = ['NIFTYBEES', 'JUNIORBEES', 'ICICIBANK'];
