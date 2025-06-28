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
    backtestDays: 360, // Use 360 days of data for backtesting
};

// You can also export supported ETF symbols here if needed
export const SUPPORTED_ETFS = ['NIFTYBEES', 'JUNIORBEES', 'ICICIBANK'];
