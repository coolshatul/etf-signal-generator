import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey", 'ripHistorical'] });
import { Candle, InstrumentType } from '../types';
import {
  isCandleComplete,
  stalenessLimitMs,
  SupportedInterval,
} from './marketTime';
import { SplitEvent } from './performanceMath';

const DEFAULT_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface FetchHistoricalOptions {
  /**
   * Drop the currently-forming candle. Defaults to true because signals must
   * only be computed from final prices.
   */
  completedOnly?: boolean;
  /** Number of attempts for transient Yahoo errors. Defaults to 3. */
  retries?: number;
}

function withNSE(symbol: string) {
  const s = symbol.trim().toUpperCase();
  if (s.startsWith('^') || s.endsWith('.NS')) {
    return s;
  }
  return `${s}.NS`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Yahoo occasionally returns nulls for halted/suspended symbols. Mapping those
 * to 0 corrupts every downstream indicator, so invalid rows are dropped here.
 *
 * Volume is treated differently for indices: an index legitimately has no
 * traded volume, while a missing stock volume is a data-quality problem and
 * would otherwise make `avgVolume20` artificially low.
 */
function sanitiseQuotes(
  quotes: any[],
  interval: SupportedInterval,
  now: Date,
  completedOnly: boolean,
  symbol: string
): Candle[] {
  const byTimestamp = new Map<number, Candle>();
  const isIndex = symbol.trim().startsWith('^');

  for (const item of quotes ?? []) {
    if (!item || item.date == null) continue;

    const timestamp = new Date(item.date).getTime();
    if (!Number.isFinite(timestamp)) continue;

    const open = Number(item.open);
    const high = Number(item.high);
    const low = Number(item.low);
    const close = Number(item.close);
    const volume = Number(item.volume);

    if (![open, high, low, close].every(Number.isFinite)) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    if (high < low) continue;

    const hasVolume = Number.isFinite(volume) && volume > 0;
    // A stock row without volume cannot support volume/OBV filters safely.
    if (!hasVolume && !isIndex) continue;

    if (completedOnly && !isCandleComplete(new Date(timestamp), interval, now)) {
      continue;
    }

    byTimestamp.set(timestamp, {
      date: new Date(timestamp).toISOString(),
      open,
      high,
      low,
      close,
      volume: hasVolume ? volume : 0,
    });
  }

  return [...byTimestamp.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, candle]) => candle);
}

export async function fetchHistoricalData(
  symbol: string,
  periods: number,
  interval: SupportedInterval = '1d',
  options: FetchHistoricalOptions = {}
): Promise<Candle[]> {
  const completedOnly = options.completedOnly ?? true;
  const attempts = Math.max(1, options.retries ?? DEFAULT_RETRY_ATTEMPTS);

  const to = new Date();
  const from = new Date(to);

  // `periods` is a calendar-day lookback for every intraday/daily/weekly
  // interval. Using calendar days (instead of bar counts) guarantees enough
  // candles even across weekends and exchange holidays.
  if (interval === '1mo') {
    from.setMonth(to.getMonth() - periods);
  } else if (interval === '1wk') {
    const weeks = Math.ceil(periods / 7);
    from.setDate(to.getDate() - weeks * 7);
  } else {
    from.setDate(to.getDate() - periods);
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const chartResult = await yahooFinance.chart(withNSE(symbol), {
        period1: from,
        period2: to,
        interval,
      });

      const candles = sanitiseQuotes(chartResult.quotes ?? [], interval, to, completedOnly, symbol);
      if (!candles.length) return [];

      // Never generate a signal from a stale series. This catches delisted
      // tickers, Yahoo outages, and long exchange closures.
      const latest = new Date(candles[candles.length - 1].date).getTime();
      if (to.getTime() - latest > stalenessLimitMs(interval)) {
        console.warn(
          `⚠️ Stale data for ${symbol} (${interval}): last candle ${candles[candles.length - 1].date}`
        );
        return [];
      }

      return candles;
    } catch (err) {
      const isLastAttempt = attempt === attempts;
      const message = err instanceof Error ? err.message : String(err);
      // Permanent symbol/data errors should not be retried.
      const permanentFailure = /delisted|no data found|not found|404/i.test(message);

      console.error(
        `❌ Error fetching ${interval} data for ${symbol} (attempt ${attempt}/${attempts}): ${message}`
      );

      if (permanentFailure || isLastAttempt) return [];
      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  return [];
}

/**
 * Fetch stock splits for a symbol over a calendar-day lookback.
 *
 * Yahoo's OHLC series is split-adjusted, but signal rows store the price at
 * alert time. A split that happens after entry therefore makes the stored
 * entry price inconsistent with the new series, which can look like a large
 * loss. The split events let performance tracking convert the stored levels
 * into post-split terms.
 */
export async function fetchCorporateActions(
  symbol: string,
  periods: number
): Promise<SplitEvent[]> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - Math.max(1, periods));

  try {
    const result = await yahooFinance.chart(withNSE(symbol), {
      period1: from,
      period2: to,
      interval: '1d',
      events: 'split',
    });

    const raw = (result as any).events?.splits;
    const list: any[] = Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];

    return list
      .map(item => {
        const numerator = Number(item?.numerator);
        const denominator = Number(item?.denominator);
        const ratio =
          numerator > 0 && denominator > 0 ? numerator / denominator : NaN;
        const date = item?.date ? new Date(item.date) : null;

        if (
          !date ||
          Number.isNaN(date.getTime()) ||
          !Number.isFinite(ratio) ||
          ratio <= 0
        ) {
          return null;
        }

        return {
          date: date.toISOString(),
          numerator,
          denominator,
          ratio,
        } satisfies SplitEvent;
      })
      .filter((split): split is SplitEvent => split !== null);
  } catch (err) {
    console.warn(`⚠️ Could not fetch corporate actions for ${symbol}:`, err);
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
