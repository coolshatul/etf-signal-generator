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
    const formattedData = Object.entries(data).map(([key, val]) => `${key}: ${val}`).join('\n');

    const chatCompletion = await getGroqClient().chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 1,
        max_tokens: 800,
        messages: [
            {
                role: 'system',
                content: `You are a financial research analyst specializing in Indian stocks and ETFs. The user will provide you with fundamental financial data for an Indian stock or ETF.

Your task:
1. Briefly assess the overall financial health of the company or ETF based on the given data.
2. Analyze key ratios such as P/E, ROE, margins, debt levels, cash flow, and liquidity.
3. Highlight notable strengths and weaknesses (for example, high profitability, strong cash flow, high debt, poor growth, etc.).
4. Suggest a long-term investment outlook: Buy, Hold, or Avoid — assuming a 1-2 year investment horizon.

Guidelines:
- Keep the analysis under 250 words.
- Present insights clearly, using short paragraphs or bullet points.
- If any metric is missing, simply mention 'Not available' for that metric.
- Do not use Markdown or any special formatting. Respond in plain text only.
- Be objective and concise; avoid overly generic statements.
- Focus on practical takeaways for investors.

Respond in a professional tone suited for swing and medium-term investors in the Indian market.`
            },
            {
                role: 'user',
                content: `${symbol}\n\n${formattedData}`
            }
        ]
    });

    return chatCompletion.choices[0]?.message?.content?.trim() || 'AI could not generate a summary.';
}
