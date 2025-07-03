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

export interface FundamentalData {
    symbol: string;
    instrumentType: 'Stock' | 'ETF' | 'MutualFund' | 'Index' | 'Crypto' | 'Unknown';
    marketCap?: number;
    peRatio?: number;
    forwardPE?: number;
    pbRatio?: number;
    bookValue?: number;
    roe?: number;
    profitMargin?: number;
    operatingMargin?: number;
    grossMargin?: number;
    debtToEquity?: number;
    freeCashFlow?: number;
    dividendYield?: number;
    payoutRatio?: number;
    totalRevenue?: number;
    netIncome?: number;
    returnOnAssets?: number;
    currentRatio?: number;
    quickRatio?: number;
    eps?: number;
    forwardEps?: number;
    enterpriseValue?: number;
    beta?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
}

export type InstrumentType = 'Stock' | 'ETF' | 'MutualFund' | 'Index' | 'Crypto' | 'Unknown';