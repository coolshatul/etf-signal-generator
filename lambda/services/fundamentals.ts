import * as dotenv from 'dotenv';
import {
    fetchSummaryDetail,
    fetchFullFinancialData,
    fetchInstrumentType,
} from '../utils/fetchData';
import { FundamentalData } from '../types';

dotenv.config();

interface NewFundamentalResponse {
    isSuccess: boolean;
    message: string;
    data: {
        symbol: string;
        companyName: string;
        sector: string;
        description: string;
        keyPoints: string;
        marketCap: number;
        currentPrice: number;
        high52w: number;
        low52w: number;
        peRatio: number;
        bookValue: number;
        dividendYield: number;
        roce: number;
        roe: number;
        faceValue: number;
        pbRatio: number;
        quarterlyData: any[];
        quarterlyInsights: any;
        salesLatestQuarter: number;
        profitLatestQuarter: number;
        eps: number;
        shareholdingPattern: any[];
        shareholdingInsights: any;
        balanceSheet: any;
        annualData: any[];
        salesLastYear: number;
        profitLastYear: number;
        operatingCashFlow: number;
        salesGrowth10Y: number;
        salesGrowth5Y: number;
        salesGrowth: number;
        salesGrowth3Y: number;
        profitGrowth10Y: number;
        profitGrowth5Y: number;
        profitGrowth: number;
        profitGrowth3Y: number;
        cagr5Y: number;
        cagr3Y: number;
        roe10Y: number;
        roe5Y: number;
        roe3Y: number;
        interestCoverage: number;
        swingTradingSignal: string;
        swingSignalReason: string;
        longTermSignal: string;
        longTermSignalReason: string;
    };
}

async function fetchNewFundamentalData(symbol: string): Promise<NewFundamentalResponse['data']> {
    const baseUrl = process.env.FUNDAMENTAL_API_BASE_URL!;
    const url = `${baseUrl}/prod/api/v1/internal/finance/getFundamentalData/${symbol}`;
    const response = await fetch(url, {
        headers: {
            'X-API-Key': process.env.FUNDAMENTAL_API_KEY!,
        },
    });

    if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const result: NewFundamentalResponse = await response.json();

    if (!result.isSuccess) {
        throw new Error(`API returned error: ${result.message}`);
    }

    return result.data;
}

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

        const data = await fetchNewFundamentalData(symbol);

        return {
            symbol,
            instrumentType,
            marketCap: data.marketCap,
            peRatio: data.peRatio,
            pbRatio: data.pbRatio,
            bookValue: data.bookValue,
            roe: data.roe,
            dividendYield: data.dividendYield,
            totalRevenue: data.salesLastYear,
            netIncome: data.profitLastYear,
            eps: data.eps,
            // Enhanced data from new API
            companyName: data.companyName,
            sector: data.sector,
            description: data.description,
            quarterlyData: data.quarterlyData,
            quarterlyInsights: data.quarterlyInsights,
            annualData: data.annualData,
            balanceSheet: data.balanceSheet,
            shareholdingPattern: data.shareholdingPattern,
            shareholdingInsights: data.shareholdingInsights,
            salesGrowth10Y: data.salesGrowth10Y,
            salesGrowth5Y: data.salesGrowth5Y,
            salesGrowth3Y: data.salesGrowth3Y,
            profitGrowth10Y: data.profitGrowth10Y,
            profitGrowth5Y: data.profitGrowth5Y,
            profitGrowth3Y: data.profitGrowth3Y,
            cagr5Y: data.cagr5Y,
            cagr3Y: data.cagr3Y,
            roe10Y: data.roe10Y,
            roe5Y: data.roe5Y,
            roe3Y: data.roe3Y,
            interestCoverage: data.interestCoverage,
            swingTradingSignal: data.swingTradingSignal,
            longTermSignal: data.longTermSignal,
            // Note: Some fields like forwardPE, forwardEps, beta, etc. are not available in the new API
            // They will remain undefined in the returned object
        };
    } catch (err) {
        console.error(`❌ Failed to fetch fundamental data for ${symbol}`, err);
        throw new Error('Could not fetch fundamental data.');
    }
}
