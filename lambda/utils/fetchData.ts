import yahooFinance from 'yahoo-finance2';
import { Candle, InstrumentType } from '../types';
yahooFinance.suppressNotices(['ripHistorical']);

function withNSE(symbol: string) {
    return symbol.trim().toUpperCase().endsWith('.NS')
        ? symbol.trim().toUpperCase()
        : `${symbol.trim().toUpperCase()}.NS`;
}

// Fetch historical data for a given symbol and number of past days/weeks
export async function fetchHistoricalData(symbol: string, days: number, interval: '1d' | '1wk' = '1d'): Promise<Candle[]> {
    const to = new Date();
    const from = new Date(to);

    if (interval === '1d') {
        from.setDate(to.getDate() - days);
    } else if (interval === '1wk') {
        // For weekly data, convert days to weeks (roughly)
        const weeks = Math.ceil(days / 7);
        from.setDate(to.getDate() - (weeks * 7));
    }

    const queryOptions = {
        period1: from.toISOString(),
        interval: interval as '1d' | '1wk',
    };

    try {
        const results = await yahooFinance.historical(withNSE(symbol), queryOptions);
        if (!results || results.length === 0) {
            throw new Error(`No historical data found for ${symbol}`);
        }

        // Map to simplified structure
        return results.map((item) => ({
            date: item.date.toISOString().split('T')[0],
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume,
        }));
    } catch (err) {
        console.error(`❌ Error fetching data for ${symbol}:`, err);
        return [];
    }
}

export async function fetchInstrumentType(symbol: string): Promise<InstrumentType> {
    const quoteTypeResult = await yahooFinance.quoteSummary(withNSE(symbol), {
        modules: ['quoteType'],
    });

    const qt = quoteTypeResult.quoteType;
    const rawType = qt?.quoteType ?? 'UNKNOWN';
    const name = `${qt?.shortName ?? ''} ${qt?.longName ?? ''}`.toLowerCase();

    if (rawType === 'ETF') return 'ETF';
    if (rawType === 'MUTUALFUND') return 'MutualFund';
    if (rawType === 'INDEX') return 'Index';
    if (rawType === 'CRYPTOCURRENCY') return 'Crypto';
    if (rawType === 'EQUITY') {
        if (
            name.includes('etf') ||
            name.includes('bees') ||
            name.includes('fund') ||
            name.includes('index')
        ) {
            return 'ETF';
        } else {
            return 'Stock';
        }
    }
    return 'Unknown';
}

export async function fetchSummaryDetail(symbol: string) {
    return yahooFinance.quoteSummary(withNSE(symbol), {
        modules: ['summaryDetail'],
    });
}

export async function fetchFullFinancialData(symbol: string) {
    return yahooFinance.quoteSummary(withNSE(symbol), {
        modules: [
            'financialData',
            'defaultKeyStatistics',
            'summaryDetail',
            'incomeStatementHistory',
            'cashflowStatementHistory',
        ],
    });
}
