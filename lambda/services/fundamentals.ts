import {
    fetchSummaryDetail,
    fetchFullFinancialData,
    fetchInstrumentType,
} from '../utils/fetchData';
import { FundamentalData } from '../types';

export async function fetchFundamentalData(symbol: string): Promise<FundamentalData> {
    try {
        const instrumentType = await fetchInstrumentType(symbol);

        if (instrumentType !== 'Stock') {
            const basicResult = await fetchSummaryDetail(symbol);
            const marketCap = basicResult.summaryDetail?.marketCap;

            console.warn(`ℹ️ ${symbol} is a ${instrumentType}. Skipping full fundamental analysis.`);
            return {
                symbol,
                instrumentType,
                marketCap,
            };
        }

        const result = await fetchFullFinancialData(symbol);
        const fd = result.financialData;
        const ks = result.defaultKeyStatistics;
        const sd = result.summaryDetail;
        const income = result.incomeStatementHistory?.incomeStatementHistory?.[0];
        const cashflow = result.cashflowStatementHistory?.cashflowStatements?.[0];

        return {
            symbol,
            instrumentType,
            marketCap: sd?.marketCap,
            peRatio: sd?.trailingPE,
            forwardPE: ks?.forwardPE,
            pbRatio: ks?.priceToBook,
            bookValue: ks?.bookValue,
            roe: fd?.returnOnEquity,
            returnOnAssets: fd?.returnOnAssets,
            profitMargin: fd?.profitMargins,
            operatingMargin: fd?.operatingMargins,
            grossMargin: fd?.grossMargins,
            debtToEquity: fd?.debtToEquity,
            freeCashFlow: fd?.freeCashflow,
            dividendYield: sd?.dividendYield,
            payoutRatio: sd?.payoutRatio,
            totalRevenue: income?.totalRevenue ?? fd?.totalRevenue,
            netIncome: income?.netIncome ?? cashflow?.netIncome,
            currentRatio: fd?.currentRatio,
            quickRatio: fd?.quickRatio,
            eps: ks?.trailingEps,
            forwardEps: ks?.forwardEps,
            enterpriseValue: ks?.enterpriseValue,
            beta: ks?.beta,
            revenueGrowth: fd?.revenueGrowth,
            earningsGrowth: fd?.earningsGrowth,
        };
    } catch (err) {
        console.error(`❌ Failed to fetch fundamental data for ${symbol}`, err);
        throw new Error('Could not fetch fundamental data.');
    }
}
