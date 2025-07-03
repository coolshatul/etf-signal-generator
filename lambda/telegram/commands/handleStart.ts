import { Telegraf } from 'telegraf';
import { sendMessage } from '../../utils/sendMessage';

export async function handleStart(bot: Telegraf<any>, chatId: number) {
    const startText = `
👋 *Welcome to ETF Swing Bot!*

I help you analyze Indian ETFs and generate swing trading signals based on backtested strategies.

Try one of the commands below to get started:

📊 /summary NIFTYBEES - Get latest signal + indicators  
🤖 /technicals NIFTYBEES - Get AI-powered technicals analysis  
📈 /fundamentals INFY - Get AI-powered fundamental analysis for Stocks
🆘 /help - See full command list

—
⚠️ This bot is for educational purposes only. Always do your own research.
`.trim();

    await sendMessage(bot, chatId, startText);
}
