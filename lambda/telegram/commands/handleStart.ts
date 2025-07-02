import { Telegraf } from 'telegraf';

export async function handleStart(bot: Telegraf<any>, chatId: number) {
    await bot.telegram.sendMessage(chatId, `
👋 *Welcome to ETF Swing Bot!*

I help you analyze Indian ETFs and generate swing trading signals based on backtested strategies 📈.

Try one of the commands below to get started:

/summary NIFTYBEES - Get latest signal + indicators  
/aisummary NIFTYBEES - Get AI-powered analysis 
/help - See full command list

⚠️ This bot is for educational purposes only. Always do your own research.

Happy trading! 💰
    `.trim());
}
