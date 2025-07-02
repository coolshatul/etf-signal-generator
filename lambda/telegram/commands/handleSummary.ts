import { Telegraf } from 'telegraf';
import { analyzeETF } from '../../services/analyzeETF';

export async function handleSummary(bot: Telegraf<any>, chatId: number, symbol: string) {
    try {
        const result = await analyzeETF(symbol);

        const message = `
📊 *ETF Summary: ${symbol}*

📆 *Date:* ${result.date}
💰 *Price:* ₹${result.price.toFixed(2)}
📈 *RSI:* ${result.rsi.toFixed(2)} ${result.rsi > 50 ? '📈 (Bullish)' : '📉 (Bearish)'}
🟢 *EMA(9):* ${result.emaFast.toFixed(2)}
🔵 *EMA(21):* ${result.emaSlow.toFixed(2)}
🚦 *Signal:* *${result.signal}*

ℹ️ Powered by backtested strategy.
        `.trim();

        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error(err);
        await bot.telegram.sendMessage(chatId, '❌ Could not analyze that symbol. Please try again.');
    }
}
