import { Groq } from 'groq-sdk';
import { FundamentalData } from '../../types';
import { formatFundamentalData } from '../../utils/fundamentalsFormatter';

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
    const formattedData = formatFundamentalData(data);

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
