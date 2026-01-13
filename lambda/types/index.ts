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
    ema9: number | null;
    ema10: number | null;
    ema15: number | null;
    ema20: number | null;
    ema21: number | null;
    ema36: number | null;
    ema50: number | null;
    macd: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    atr: number | null;
    adx: number | null;
    bbUpper: number | null;
    bbLower: number | null;
    bbMiddle: number | null;
    volEma20: number | null;
    avgVolume20: number | null;
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

// Result for bullish stock analysis
export interface BullishStockResult {
    symbol: string;
    isBullish: boolean;
    rating: number;
    price: number;
    signals: string[];
    stopLoss: number;
    target: number;
    stopLossPercent: number;
    targetPercent: number;
    riskRewardRatio: number;
    swingLow: number;
    swingHigh: number;
    baseStopLevel: number;
    marketRegimeBullish?: boolean;
}

// Result for EMA36 analysis
export interface EMA36Result {
    symbol: string;
    ltp: number;        // Last Traded Price
    ema36: number;      // 36-period EMA value
    status: 'APPROACHING_BREAKOUT';
    percentDiff: number; // Percentage difference from EMA
}

// Result for EMA crossover analysis
export interface EMACrossoverResult {
    symbol: string;
    price: number;      // Last traded price
    ema9: number;       // 9-period EMA value
    ema15: number;      // 15-period EMA value
    ema50: number;      // 50-period EMA value
    crossoverType: 'BULLISH' | 'BEARISH'; // Type of crossover cascade
    signal: string;     // Description of the crossover signal
    rsi?: number;       // RSI value at crossover
    stopLoss?: number;  // Recommended stop loss
    target?: number;    // Recommended target
}
