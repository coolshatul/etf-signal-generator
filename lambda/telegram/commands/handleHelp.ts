import { Telegraf } from 'telegraf';
import { sendMessage } from '../../utils/sendMessage';

export async function handleHelp(bot: Telegraf<any>, chatId: number) {
  const helpText = `
🆘 *ETF Swing Bot - Help Menu*

Use the commands below to interact with the bot:

📊 *Analysis*
/summary SYMBOL - View swing signal, RSI, EMAs  
/technicals SYMBOL - Get AI-powered technicals analysis  
/fundamentals SYMBOL - Get AI-powered fundamental analysis  

🛠 *Utilities*
/help - Show this help message  
/start - Introduction and usage

Examples:
/summary NIFTYBEES
/summary BANKBEES

—
⚠️ This bot is not financial advice. Swing trades carry risk.
  `.trim();

  await sendMessage(bot, chatId, helpText);
}
