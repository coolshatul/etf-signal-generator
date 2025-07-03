import { Groq } from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function askGroqForTechnicalsAnalysis(symbol: string, data: any): Promise<string> {
    const formattedData = Object.entries(data)
        .map(([key, val]) => `${key}: ${val}`)
        .join('\n');

    const chatCompletion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 1,
        max_tokens: 800,
        messages: [
            {
                role: 'system',
                content: `You are a financial assistant specializing in technical analysis of Indian ETFs and stocks. The user will send technical indicators for an Indian ETF or stock.

Your tasks:
1. Analyze the overall trend direction using EMA(9), EMA(21), RSI, and MACD.
2. Assess the strength of the trend using ADX.
3. Evaluate volatility using ATR.
4. Examine the price position relative to Bollinger Bands.
5. Consider trading volume against the 20-day average.

Your response must include:
- A brief trend summary.
- Insights on momentum, strength, and volatility.
- A suggested outlook for the next 1 to 3 months: Buy, Hold, or Sell.

Guidelines:
- Keep the response concise, under 250 words.
- Use short bullet points or short paragraphs.
- If any value is missing, simply mention "Data not available".
- Do not use Markdown or any formatting. Respond in plain text only.
- Do not ask for additional data or clarification.

Your tone should be neutral, professional, and focused on providing actionable insights for traders in the Indian market.`
            },
            {
                role: 'user',
                content: `${symbol}\n\n${formattedData}`
            }
        ]
    });

    return chatCompletion.choices[0]?.message?.content?.trim() || 'AI could not generate a summary.';
}
