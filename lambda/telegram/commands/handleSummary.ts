import { Telegraf } from 'telegraf';
import { analyzeETF } from '../../services/analyzeETF';
import { sendMessage } from '../../utils/sendMessage';

export async function handleSummary(bot: Telegraf<any>, chatId: number, symbol: string) {
    try {
        const result = await analyzeETF(symbol);

        const message = `
📊 *ETF Summary: ${symbol}*

📆 *Date:* ${result.date}
💰 *Price:* ₹${result.price.toFixed(2)}
📈 *RSI:* ${result.rsi.toFixed(2)} ${result.rsi > 50 ? '(Bullish)' : '(Bearish)'}
🟢 *EMA(9):* ${result.emaFast.toFixed(2)}
🔵 *EMA(21):* ${result.emaSlow.toFixed(2)}
🚦 *Signal:* *${result.signal}*

ℹ️ Based on backtested strategy.
    `.trim();

        await sendMessage(bot, chatId, message);
    } catch (err) {
        console.error(err);
        await sendMessage(bot, chatId, `❌ Could not analyze *${symbol}*. Please make sure it's a valid ETF symbol listed on NSE.`);
    }
}
