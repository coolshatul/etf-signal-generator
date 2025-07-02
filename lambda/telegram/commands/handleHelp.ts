import { Telegraf } from 'telegraf';

export async function handleHelp(bot: Telegraf<any>, chatId: number) {
    await bot.telegram.sendMessage(chatId, `
🆘 *ETF Swing Bot - Help Menu*

Use the commands below to interact with the bot:

📊 *Analysis*
/summary SYMBOL - View swing signal, RSI, EMAs  
/aisummary SYMBOL - Get a detailed AI-generated summary  

🛠 *Utilities*
/help - Show this help message  
/start - Introduction and usage

Examples:
/summary NIFTYBEES
/summary BANKBEES

—
⚠️ This bot is not financial advice. Swing trades carry risk.
    `.trim());
}
