import { Groq } from 'groq-sdk';
import { FundamentalData } from '../../types';

let groq: Groq | null = null;

function getGroqClient(): Groq {
    if (!groq) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('GROQ_API_KEY environment variable is not set');
        }
        groq = new Groq({ apiKey });
    }
    return groq;
}

export async function askGroqForFundamentalAnalysis(symbol: string, data: FundamentalData): Promise<string> {
    // Format basic financial metrics
    const basicMetrics = [
        `Company: ${data.companyName || 'N/A'}`,
        `Sector: ${data.sector || 'N/A'}`,
        `Market Cap: ₹${data.marketCap?.toLocaleString() || 'N/A'}`,
        `P/E Ratio: ${data.peRatio || 'N/A'}`,
        `P/B Ratio: ${data.pbRatio || 'N/A'}`,
        `ROE: ${data.roe ? `${data.roe}%` : 'N/A'}`,
        `Dividend Yield: ${data.dividendYield ? `${data.dividendYield}%` : 'N/A'}`,
        `EPS: ₹${data.eps || 'N/A'}`,
        `Book Value: ₹${data.bookValue || 'N/A'}`,
    ].join('\n');

    // Format growth metrics
    const growthMetrics = [
        `Sales Growth (10Y): ${data.salesGrowth10Y ? `${data.salesGrowth10Y}%` : 'N/A'}`,
        `Sales Growth (5Y): ${data.salesGrowth5Y ? `${data.salesGrowth5Y}%` : 'N/A'}`,
        `Sales Growth (3Y): ${data.salesGrowth3Y ? `${data.salesGrowth3Y}%` : 'N/A'}`,
        `Profit Growth (10Y): ${data.profitGrowth10Y ? `${data.profitGrowth10Y}%` : 'N/A'}`,
        `Profit Growth (5Y): ${data.profitGrowth5Y ? `${data.profitGrowth5Y}%` : 'N/A'}`,
        `Profit Growth (3Y): ${data.profitGrowth3Y ? `${data.profitGrowth3Y}%` : 'N/A'}`,
        `CAGR (5Y): ${data.cagr5Y ? `${data.cagr5Y}%` : 'N/A'}`,
        `CAGR (3Y): ${data.cagr3Y ? `${data.cagr3Y}%` : 'N/A'}`,
    ].join('\n');

    // Format quarterly insights
    const quarterlyInsights = data.quarterlyInsights ? [
        `Sales Trend: ${data.quarterlyInsights.salesGrowth || 'N/A'}`,
        `Profit Trend: ${data.quarterlyInsights.profitGrowth || 'N/A'}`,
        `Margin Trend: ${data.quarterlyInsights.marginTrend || 'N/A'}`,
        `EPS Consistency: ${data.quarterlyInsights.epsConsistency || 'N/A'}`,
        `Business Cycle: ${data.quarterlyInsights.businessCycle || 'N/A'}`,
        `Recent Performance: ${data.quarterlyInsights.recentPerformance || 'N/A'}`,
        `Risk Level: ${data.quarterlyInsights.riskLevel || 'N/A'}`,
    ].join('\n') : 'Quarterly insights not available';

    // Format balance sheet insights
    const balanceSheetInsights = data.balanceSheet?.insights ? [
        `Debt-to-Equity: ${data.balanceSheet.insights.debtToEquity || 'N/A'}`,
        `Current Ratio: ${data.balanceSheet.insights.currentRatio || 'N/A'}`,
        `Asset Quality: ${data.balanceSheet.insights.assetQuality || 'N/A'}`,
        `Financial Health: ${data.balanceSheet.insights.financialHealth || 'N/A'}`,
        `Balance Sheet Risk: ${data.balanceSheet.insights.riskLevel || 'N/A'}`,
    ].join('\n') : 'Balance sheet insights not available';

    // Format shareholding insights
    const shareholdingInsights = data.shareholdingInsights ? [
        `Promoter Stability: ${data.shareholdingInsights.promoterStability || 'N/A'}`,
        `Institutional Ownership: ${data.shareholdingInsights.institutionalOwnership || 'N/A'}`,
        `Retail Participation: ${data.shareholdingInsights.retailParticipation || 'N/A'}`,
        `Ownership Concentration: ${data.shareholdingInsights.ownershipConcentration || 'N/A'}`,
        `Ownership Risk: ${data.shareholdingInsights.riskLevel || 'N/A'}`,
        `Recent Changes: ${data.shareholdingInsights.recentChanges || 'N/A'}`,
    ].join('\n') : 'Shareholding insights not available';

    // Format trading signals
    const tradingSignals = [
        `Swing Trading Signal: ${data.swingTradingSignal || 'N/A'}`,
        `Long-term Signal: ${data.longTermSignal || 'N/A'}`,
    ].join('\n');

    const formattedData = [
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
        '',
        '=== TRADING SIGNALS ===',
        tradingSignals,
    ].join('\n');

    const chatCompletion = await getGroqClient().chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 1,
        max_tokens: 1000,
        messages: [
            {
                role: 'system',
                content: `You are a senior financial research analyst specializing in Indian stocks. You have access to comprehensive fundamental data including quarterly trends, balance sheet analysis, shareholding patterns, and growth metrics.

Your task:
1. Assess overall financial health considering profitability, growth, balance sheet strength, and ownership patterns.
2. Analyze key ratios (P/E, ROE, P/B) and growth trends across different timeframes (3Y, 5Y, 10Y).
3. Evaluate quarterly performance consistency and business cycle positioning.
4. Review balance sheet health, debt levels, and liquidity position.
5. Consider institutional ownership patterns and promoter stability.
6. Factor in the company's trading signals and market positioning.
7. Suggest investment outlook: Strong Buy, Buy, Hold, or Avoid for 1-2 year horizon.

Guidelines:
- Keep analysis under 300 words.
- Structure with clear sections: Financial Health, Growth Analysis, Risk Assessment, Investment Outlook.
- Use quarterly insights, balance sheet health, and shareholding patterns in your analysis.
- Be specific about strengths/weaknesses with data references.
- Consider both fundamental metrics and market signals.
- If data is missing, note it but don't let it dominate the analysis.
- Respond in plain text only, no markdown.
- Be objective and data-driven.

Focus on practical investment insights for Indian market investors.`
            },
            {
                role: 'user',
                content: `${symbol} Analysis\n\n${formattedData}`
            }
        ]
    });

    return chatCompletion.choices[0]?.message?.content?.trim() || 'AI could not generate a summary.';
}
