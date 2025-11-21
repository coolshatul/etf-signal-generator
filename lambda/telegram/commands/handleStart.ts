import { Telegraf } from 'telegraf';
import { sendMessage } from '../../utils/sendMessage';

export async function handleStart(bot: Telegraf<any>, chatId: number) {
    const startText = `
👋 *Welcome to Swing Bot!*

I help you analyze Indian ETFs and Stocks by providing technical, fundamental, and sentiment-based analysis, along with swing trading signals.

📌 Available Commands:

🤖 /technicals NIFTYBEES
Get AI-powered technical analysis for an ETF or Stock.

📈 /fundamentals INFY  
Get AI-powered fundamental analysis for Indian Stocks.

📰 /news INFY 5
Get sentiment analysis from latest news headlines (optional limit, max 20).

🆘 /help  
See the full command list.

—
⚠️ This bot is for educational purposes only. Please do your own research before making any investment decisions.
`.trim();

    await sendMessage(bot, chatId, startText);
}
