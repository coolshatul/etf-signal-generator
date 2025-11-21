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

// Configuration constants
export const API_CONFIG = {
    DELAY_MS: 100,  // Delay between API calls to avoid rate limits
    CONCURRENCY_LIMIT: 5  // Maximum concurrent API calls
};

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