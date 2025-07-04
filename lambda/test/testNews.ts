import { fetchNewsWithSentiment } from '../services/news';

async function handleNews(): Promise<void> {
    try {
        const symbol = 'INFY'; // Example symbol, can be replaced with any valid stock symbol
        console.log(`📰 Fetching news sentiment for "${symbol}"...`);
        const sentimentScores = await fetchNewsWithSentiment(symbol);

        if (sentimentScores.length === 0) {
            console.log('⚠️ No recent news found for "INFY".');
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

        console.log(summary);
    } catch (err) {
        console.error('❌ Error fetching news:', err);

    }
}

// Run the function to test
(async () => {
    console.log('📰 Starting news sentiment analysis test...');
    await handleNews();
    console.log('✅ News sentiment analysis test completed.');
})();
