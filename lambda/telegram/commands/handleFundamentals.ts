import { Telegraf } from 'telegraf';
import { fetchFundamentalData } from '../../services/fundamentals';
import { askGroqForFundamentalAnalysis } from '../../services/groq/aiFundamentalAnalysis';
import { sendMessage } from '../../utils/sendMessage';

export async function handleFundamentals(bot: Telegraf<any>, chatId: number, symbol: string) {
    try {
        const data = await fetchFundamentalData(symbol);

        if (data.instrumentType !== 'Stock') {
            await sendMessage(
                bot,
                chatId,
                `⚠️ Fundamental analysis is only available for *Stocks*.\nThis instrument (*${symbol}*) is classified as: *${data.instrumentType}*`
            );
            return;
        }

        const aiSummary = await askGroqForFundamentalAnalysis(symbol, data);

        const formattedData = Object.entries(data)
            .map(([key, val]) => `${key}: ${val}`)
            .join('\n');
        const response = `📘 *Fundamental Outlook for ${symbol}*\n\n${aiSummary}\n\n📋 *Data Used:*\n\`\`\`\n${formattedData}\n\`\`\``;

        await sendMessage(bot, chatId, response);
    } catch (err) {
        console.error(err);
        await sendMessage(bot, chatId, `❌ Could not fetch fundamental data for *${symbol}*. Please check the symbol.`);
    }
}
