import { analyzeETFForAISummary } from '../../services/analyzeETFForAISummary';
import { Groq } from 'groq-sdk';
import { Telegraf } from 'telegraf';

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function handleAISummary(bot: Telegraf, chatId: string, symbol: string): Promise<void> {
    try {
        const result = await analyzeETFForAISummary(symbol);

        const userPrompt = `
ETF: ${result.symbol}
Date: ${result.date}
Price: ₹${result.price?.toFixed(2)}

Indicators:
- RSI: ${result.rsi ?? 'N/A'}
- EMA(9): ${result.emaFast ?? 'N/A'}
- EMA(21): ${result.emaSlow ?? 'N/A'}
- MACD: ${result.macd ?? 'N/A'}
- MACD Signal: ${result.macdSignal ?? 'N/A'}
- ATR: ${result.atr ?? 'N/A'}
- ADX: ${result.adx ?? 'N/A'}
- Bollinger Bands: Upper ${result.bbUpper ?? 'N/A'}, Middle ${result.bbMiddle ?? 'N/A'}, Lower ${result.bbLower ?? 'N/A'}
- Avg Volume (20): ${result.avgVolume20 ?? 'N/A'}

Backtest Stats:
- Days: ${result.backtestStats.backtestDays}
- Trades: ${result.backtestStats.totalTrades}
- Win Rate: ${result.backtestStats.winRate}%
- Profit: ${result.backtestStats.totalProfit}
- Annual Return: ${result.backtestStats.annualReturn}
- Best Trade: ${result.backtestStats.bestTrade}%
- Worst Trade: ${result.backtestStats.worstTrade}%
- Avg Holding: ${result.backtestStats.avgHoldingDays} days
- Beats FD (7%): ${result.backtestStats.beatsFD}
`;

        const chatCompletion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            temperature: 1,
            max_tokens: 800,
            messages: [
                {
                    role: 'system',
                    content: `You are a financial assistant. The user will provide technical and backtest data of an Indian ETF.

Your job:
- Analyze trend using RSI, EMA(9), EMA(21), and MACD.
- Evaluate strength with ADX, volatility with ATR, and position within Bollinger Bands.
- Assess volume activity compared to 20-day average.
- Consider backtest results: total trades, win rate, best/worst trade, average holding days, profit, and annual return.

Respond with:
1. Trend overview based on indicators.
2. Technical insights on strength, volatility, and volume.
3. Suggested action: Buy, Hold, or Sell for 1-3 months.
4. Confidence level based on backtest performance.

Use short paragraphs or bullet points.
Keep it under 200 words.
If a value is missing, say "Data not available".
Do not ask for more data.
`
                },
                {
                    role: 'user',
                    content: userPrompt,
                },
            ],
        });

        const aiMessage = chatCompletion.choices[0]?.message?.content?.trim();
        const reply = aiMessage || '❌ AI summary could not be generated.';

        const response = `🤖 *AI Swing Summary for ${symbol}*\n\n${reply}\n\n📋 *Data Used:*\n\`\`\`\n${userPrompt.trim()}\n\`\`\``;

        await bot.telegram.sendMessage(chatId, response, {
            parse_mode: 'Markdown',
        });
    } catch (err: any) {
        console.error('❌ Error generating AI summary:', err);
        await bot.telegram.sendMessage(chatId, `❌ Failed to generate AI summary for ${symbol}.`);
    }
}
