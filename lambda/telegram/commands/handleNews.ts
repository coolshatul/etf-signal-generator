import { Telegraf } from 'telegraf';
import { fetchNewsWithSentiment } from '../../services/news';
import { sendMessage } from '../../utils/sendMessage';

export async function handleNews(bot: Telegraf, chatId: number, symbol: string, limit: number = 5): Promise<void> {
    try {

        const sentimentScores = await fetchNewsWithSentiment(symbol, limit);

        if (sentimentScores.length === 0) {
            await sendMessage(bot, chatId, `⚠️ No recent news found for "${symbol}".`);
            return;
        }

        // Count sentiment categories
        const positive = sentimentScores.filter(item => item.score.compound > 0.05).length;
        const negative = sentimentScores.filter(item => item.score.compound < -0.05).length;
        const neutral = sentimentScores.length - positive - negative;

        // Sort by latest date (optional but recommended)
        sentimentScores.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        const summary = `
📰 *Sentiment Snapshot for "${symbol}" (Latest News)*

Top Headlines & Sentiment Scores:
${sentimentScores.map(({ headline, score, link, pubDate }, i) =>
            `${i + 1}. ${headline}\n   🔗 [Read More](${link}) | 📅 ${pubDate}\n   → Sentiment Score: ${score.compound.toFixed(2)}`
        ).join('\n\n')}

📝 *Sentiment Summary:*
- 🟢 Positive News Count: ${positive}
- 🔴 Negative News Count: ${negative}
- ⚪ Neutral News Count: ${neutral}

ℹ️ Sentiment scores range from -1 (very negative) to +1 (very positive).

📌 This is an automated analysis. Please verify the news before making investment decisions.
`.trim();

        await sendMessage(bot, chatId, summary);
    } catch (err: any) {
        console.error(`❌ Error fetching news for ${symbol}:`, err);
        await sendMessage(bot, chatId, `❌ Failed to fetch news for ${symbol}.`);
    }
}
