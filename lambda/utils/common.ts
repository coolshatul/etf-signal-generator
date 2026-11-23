// Shared constants and utilities for Nifty50 analysis

// Nifty50 symbols (excluding NIFTY index)
export const nifty50Symbols = [
    'ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV',
    'BEL', 'BHARTIARTL', 'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'ETERNAL', 'GRASIM', 'HCLTECH',
    'HDFCBANK', 'HDFCLIFE', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK', 'INDIGO', 'INFY', 'ITC', 'JIOFIN',
    'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'MAXHEALTH', 'NESTLEIND', 'NTPC', 'ONGC',
    'POWERGRID', 'RELIANCE', 'SBILIFE', 'SHRIRAMFIN', 'SBIN', 'SUNPHARMA', 'TCS', 'TATACONSUM', 'TMPV',
    'TATASTEEL', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'
];

export const niftyNext50Symbols = [
    'VBL', 'BAJAJHLDNG', 'HINDZINC', 'VEDL', 'ADANIGREEN', 'INDHOTEL', 'HAL', 'ENRIN', 'ADANIENSOL',
    'JINDALSTEL', 'BANKBARODA', 'CHOLAFIN', 'HAVELLS', 'HYUNDAI', 'TVSMOTOR', 'UNITDSPR', 'ZYDUSLIFE', 'BRITANNIA', 'MOTHERSON',
    'JSWENERGY', 'AMBUJACEM', 'GODREJCP', 'MAZDOCK', 'PIDILITIND', 'DLF', 'CANBK', 'PNB', 'ADANIPOWER', 'BAJAJHFL',
    'SOLARINDS', 'DMART', 'SIEMENS', 'DIVISLAB', 'RECLTD', 'TORNTPHARM', 'LODHA', 'ICICIGI', 'IRFC', 'TATAPOWER',
    'PFC', 'NAUKRI', 'BOSCHLTD', 'LICI', 'CGPOWER', 'IOC', 'ABB', 'SHREECEM', 'BPCL', 'GAIL'
];

// Liquid NSE ETFs with usable Yahoo history. Excludes money-market funds
// (LIQUIDBEES) because they are not swing instruments.
export const etfSymbols = [
    'NIFTYBEES', 'JUNIORBEES', 'BANKBEES', 'ITBEES', 'GOLDBEES',
    'SILVERBEES', 'CPSEETF', 'INFRABEES', 'PSUBNKBEES', 'MON100',
    'MAFANG', 'MOM100', 'HDFCNIFTY', 'NIFTYETF', 'HDFCMID150',
    'ICICIB22', 'ABSLNN50ET', 'TNIDETF', 'NETF', 'VAL30IETF',
    'ALPHA', 'LOWVOL1', 'NV20', 'QUAL30IETF', 'SENSEXETF',
    'HDFCSML250', 'MIDCAPETF', 'CONSUMBEES', 'AUTOBEES', 'PHARMABEES',
    'FMCGIETF', 'PSUBNKIETF', 'BSE500IETF',
];

// ETFs that actually trade. Threshold is a median daily traded value of
// roughly Rs 5 crore over the last 120 sessions. Alerts on thinner ETFs would
// be signals you cannot fill at the quoted price.
export const liquidEtfSymbols = [
    'SILVERBEES', 'GOLDBEES', 'NIFTYBEES', 'BANKBEES', 'ITBEES',
    'JUNIORBEES', 'HDFCSML250', 'MON100', 'PSUBNKBEES', 'PHARMABEES',
    'MAFANG', 'CPSEETF', 'ALPHA', 'FMCGIETF', 'NIFTYETF', 'MIDCAPETF',
    'AUTOBEES',
];

// Stricter subset for intraday scans: roughly Rs 12 crore median daily value,
// so a 15-minute bar has enough turnover to enter and exit.
export const intradayEtfSymbols = [
    'SILVERBEES', 'GOLDBEES', 'NIFTYBEES', 'BANKBEES', 'ITBEES',
    'JUNIORBEES', 'HDFCSML250', 'MON100', 'PSUBNKBEES', 'PHARMABEES',
];

// Exposure groups for book-level concentration limits. Correlated ETFs share
// a group, so the book cannot become one large directional bet.
export const ETF_EXPOSURE_GROUPS: Record<string, string> = {
    GOLDBEES: 'commodity',
    SILVERBEES: 'commodity',
    MON100: 'us_tech',
    MAFANG: 'us_tech',
    ITBEES: 'it',
    BANKBEES: 'banks',
    PSUBNKBEES: 'banks',
    NIFTYBEES: 'broad',
    NIFTYETF: 'broad',
    JUNIORBEES: 'broad',
    HDFCSML250: 'broad',
    MIDCAPETF: 'broad',
    ALPHA: 'broad',
    PHARMABEES: 'sector',
    FMCGIETF: 'sector',
    AUTOBEES: 'sector',
    CPSEETF: 'sector',
};

export function etfExposureGroup(symbol: string): string {
    return ETF_EXPOSURE_GROUPS[symbol.trim().toUpperCase()] ?? 'other';
}

// Configuration constants
export const API_CONFIG = {
    DELAY_MS: 100,  // Delay between API calls to avoid rate limits
    CONCURRENCY_LIMIT: 5  // Maximum concurrent API calls
};

// Standardised lookbacks (calendar days) so indicator seeds are consistent
// across scanners. EMA values depend on where the series starts.
export const LOOKBACK_DAYS = {
    daily: 365,          // ~250 trading days
    weekly: 1095,        // ~3 years
    fifteenMinutes: 20,  // enough bars to survive weekends/holidays
    oneHour: 40,
} as const;

export const TELEGRAM_CONFIG = {
    MAX_MESSAGE_LENGTH: 4096,
    MAX_STOCKS_DISPLAY: 10,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000
};

export const MESSAGES = {
    DISCLAIMER: '⚠️ _This is not financial advice. Always do your own research._',
    SEPARATOR: '━━━━━━━━━━━━━━━━━━'
};

/**
 * Delays execution for the specified milliseconds
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Processes an array of items with concurrency control
 * @param items Array of items to process
 * @param processor Function to process each item
 * @param concurrencyLimit Maximum number of concurrent operations
 * @param delayMs Delay between batches (optional)
 */
export async function processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    concurrencyLimit: number = API_CONFIG.CONCURRENCY_LIMIT,
    delayMs: number = API_CONFIG.DELAY_MS
): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += concurrencyLimit) {
        const batch = items.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(processor);
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        if (delayMs > 0 && i + concurrencyLimit < items.length) {
            await delay(delayMs);
        }
    }
    return results;
}