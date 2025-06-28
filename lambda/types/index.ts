// Historical candle data structure
export interface Candle {
    close: number;
    high: number;
    low: number;
    open: number;
    volume: number;
    date: string;
    [key: string]: any;
}

// After indicators are applied
export interface CandleWithIndicators extends Candle {
    rsi: number | null;
    emaFast: number | null;
    emaSlow: number | null;
}

// Strategy configuration
export interface StrategySettings {
    rsiPeriod: number;
    emaFastPeriod: number;
    emaSlowPeriod: number;
    // trailing & risk config
    takeProfit: number;
    stopLoss: number;
    trailingTrigger: number;
    trailingStop: number;
    cooldownDays: number;
    backtestDays: number;
}

// Result of analyzeETF()
export interface StrategyResult {
    symbol: string;
    date: string;
    price: number;
    rsi: number;
    emaFast: number;
    emaSlow: number;
    signal: 'BUY' | 'SELL' | 'HOLD';
    reason: string;

    // New optional fields
    lastTrade?: {
        type: 'BUY' | 'SELL' | 'HOLD';
        date: string;
        price: number;
        changeSince?: string; // e.g., "+2.15%"
    };
    backtestStats?: {
        totalTrades: number;
        totalProfit: string;
        annualReturn: string;
        winRate: string;
    };
}

