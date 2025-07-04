import { Telegraf } from 'telegraf';
import { sendMessage } from '../../utils/sendMessage';

export async function handleHelp(bot: Telegraf<any>, chatId: number) {
  const helpText = `
🆘 *ETF Swing Bot - Help Guide*

Here are the available commands you can use:

📊 /summary SYMBOL  
Get the latest trading signal and key technical indicators for Indian ETFs or Stocks.  
*Example:* /summary NIFTYBEES

🤖 /technicals SYMBOL  
Receive an AI-powered technical analysis based on common indicators like EMA, RSI, MACD, etc.  
*Example:* /technicals NIFTYBEES

📈 /fundamentals SYMBOL  
Get an AI-powered fundamental analysis for Indian Stocks, covering key financial ratios, cash flow, and valuation.  
*Example:* /fundamentals INFY

📰 /news SYMBOL [LIMIT]  
Fetch latest news headlines and get a sentiment analysis summary.  
*Optional:* You can specify the number of headlines (default 5, max 20).  
*Example:* /news INFY 5

ℹ️ *Notes:*  
- Use NSE symbols (e.g., INFY for Infosys, NIFTYBEES for ETFs).  
- This bot is focused on Indian markets (NSE-listed assets).  
- Sentiment analysis & AI summaries are experimental.

—
⚠️ *Disclaimer:* This bot is for educational purposes only. Always verify data and consult financial experts before investing.
`.trim();

  await sendMessage(bot, chatId, helpText);
}
