import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", 'ripHistorical'] });
import { Candle, InstrumentType } from '../types';

function withNSE(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (s.startsWith('^') || s.endsWith('.NS')) {
    return s;
  }
  return `${s}.NS`;
}

export async function fetchHistoricalData(
  symbol: string,
  periods: number,
  interval: '15m' | '1h' | '1d' | '1wk' | '1mo' = '1d'
): Promise<Candle[]> {

  const to = new Date();
  const from = new Date(to);

  // Calculate from date based on interval and periods
  if (interval === '1d') {
    from.setDate(to.getDate() - periods);
  } else if (interval === '1wk') {
    const weeks = Math.ceil(periods / 7);
    from.setDate(to.getDate() - weeks * 7);
  } else if (interval === '1mo') {
    from.setMonth(to.getMonth() - periods);
  } else if (interval === '1h') {
    const hours = periods;
    from.setHours(to.getHours() - hours);
  } else if (interval === '15m') {
    // For 15m intervals, calculate based on minutes
    const totalMinutes = periods * 15;
    from.setMinutes(to.getMinutes() - totalMinutes);
  }

  try {
    let results;

    const chartResult = await yahooFinance.chart(withNSE(symbol), {
        period1: from,
        period2: to,
        interval: interval
      });
      results = chartResult.quotes;

    if (!results?.length) {
      throw new Error(`No historical data found for ${symbol}`);
    }

    return results.map((item: any) => ({
      date: item.date.toISOString(),
      open: item.open ?? 0,
      high: item.high ?? 0,
      low: item.low ?? 0,
      close: item.close ?? 0,
      volume: item.volume ?? 0
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
