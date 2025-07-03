import { fetchTechnicalData } from '../../services/technicals';
import { Telegraf } from 'telegraf';
import { sendMessage } from '../../utils/sendMessage';
import { askGroqForTechnicalsAnalysis } from '../../services/groq/aiTechnicalAnalysis';

export async function handleTechnicals(bot: Telegraf, chatId: number, symbol: string): Promise<void> {
    try {
        const data = await fetchTechnicalData(symbol);

        const aiSummary = await askGroqForTechnicalsAnalysis(symbol, data);

        const formattedData = Object.entries(data)
            .map(([key, val]) => `${key}: ${val}`)
            .join('\n');

        const response = `🤖 *Technical Analysis for ${symbol}*\n\n${aiSummary}\n\n📋 *Data Used:*\n\`\`\`\n${formattedData}\n\`\`\``;

        await sendMessage(bot, chatId, response);
    } catch (err: any) {
        console.error('❌ Error generating AI summary:', err);
        await sendMessage(bot, chatId, `❌ Failed to generate AI summary for ${symbol}.`);
    }
}
