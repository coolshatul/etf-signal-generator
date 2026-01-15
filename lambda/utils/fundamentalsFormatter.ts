import { FundamentalData } from '../types';

interface MetricConfig {
    label: string;
    key: keyof FundamentalData | string;
    suffix?: string;
}

interface SectionConfig {
    title: string;
    dataPath?: string;
    metrics: MetricConfig[];
}

function formatMetric(label: string, value: any, suffix: string = ''): string {
    return `${label}: ${value ? `${value}${suffix}` : 'N/A'}`;
}

function formatOptionalSection(data: any, sectionName: string, metrics: MetricConfig[]): string {
    if (!data) return `${sectionName} not available`;

    return metrics.map(({ label, key, suffix }) => formatMetric(label, data[key], suffix)).join('\n');
}

export function formatFundamentalData(data: FundamentalData): string {
    // Basic financial metrics
    const basicMetrics = [
        { label: 'Company', key: 'companyName' },
        { label: 'Sector', key: 'sector' },
        { label: 'Market Cap', key: 'marketCap', suffix: '₹' },
        { label: 'P/E Ratio', key: 'peRatio' },
        { label: 'P/B Ratio', key: 'pbRatio' },
        { label: 'ROE', key: 'roe', suffix: '%' },
        { label: 'Dividend Yield', key: 'dividendYield', suffix: '%' },
        { label: 'EPS', key: 'eps', suffix: '₹' },
        { label: 'Book Value', key: 'bookValue', suffix: '₹' },
    ].map(({ label, key, suffix }) => formatMetric(label, (data as any)[key], suffix)).join('\n');

    // Growth metrics
    const growthMetrics = [
        { label: 'Sales Growth (10Y)', key: 'salesGrowth10Y', suffix: '%' },
        { label: 'Sales Growth (5Y)', key: 'salesGrowth5Y', suffix: '%' },
        { label: 'Sales Growth (3Y)', key: 'salesGrowth3Y', suffix: '%' },
        { label: 'Profit Growth (10Y)', key: 'profitGrowth10Y', suffix: '%' },
        { label: 'Profit Growth (5Y)', key: 'profitGrowth5Y', suffix: '%' },
        { label: 'Profit Growth (3Y)', key: 'profitGrowth3Y', suffix: '%' },
        { label: 'CAGR (5Y)', key: 'cagr5Y', suffix: '%' },
        { label: 'CAGR (3Y)', key: 'cagr3Y', suffix: '%' },
    ].map(({ label, key, suffix }) => formatMetric(label, (data as any)[key], suffix)).join('\n');

    // Quarterly insights
    const quarterlyInsights = formatOptionalSection(data.quarterlyInsights, 'Quarterly insights', [
        { label: 'Sales Trend', key: 'salesGrowth' },
        { label: 'Profit Trend', key: 'profitGrowth' },
        { label: 'Margin Trend', key: 'marginTrend' },
        { label: 'EPS Consistency', key: 'epsConsistency' },
        { label: 'Business Cycle', key: 'businessCycle' },
        { label: 'Recent Performance', key: 'recentPerformance' },
        { label: 'Risk Level', key: 'riskLevel' },
    ]);

    // Balance sheet insights
    const balanceSheetInsights = formatOptionalSection(data.balanceSheet?.insights, 'Balance sheet insights', [
        { label: 'Debt-to-Equity', key: 'debtToEquity' },
        { label: 'Current Ratio', key: 'currentRatio' },
        { label: 'Asset Quality', key: 'assetQuality' },
        { label: 'Financial Health', key: 'financialHealth' },
        { label: 'Balance Sheet Risk', key: 'riskLevel' },
    ]);

    // Shareholding insights
    const shareholdingInsights = formatOptionalSection(data.shareholdingInsights, 'Shareholding insights', [
        { label: 'Promoter Stability', key: 'promoterStability' },
        { label: 'Institutional Ownership', key: 'institutionalOwnership' },
        { label: 'Retail Participation', key: 'retailParticipation' },
        { label: 'Ownership Concentration', key: 'ownershipConcentration' },
        { label: 'Ownership Risk', key: 'riskLevel' },
        { label: 'Recent Changes', key: 'recentChanges' },
    ]);

    return [
        '=== BASIC FINANCIAL METRICS ===',
        basicMetrics,
        '',
        '=== GROWTH METRICS ===',
        growthMetrics,
        '',
        '=== QUARTERLY INSIGHTS ===',
        quarterlyInsights,
        '',
        '=== BALANCE SHEET HEALTH ===',
        balanceSheetInsights,
        '',
        '=== SHAREHOLDING ANALYSIS ===',
        shareholdingInsights,
    ].join('\n');
}
