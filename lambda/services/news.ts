import Parser from 'rss-parser';
import vader from 'vader-sentiment';

type NewsItem = {
    headline: string;
    link: string;
    pubDate: string;
    score: {
        compound: number;
        pos: number;
        neu: number;
        neg: number;
    };
};

export async function fetchNewsWithSentiment(symbol: string, limit = 5): Promise<NewsItem[]> {
    const parser = new Parser();
    const query = encodeURIComponent(`${symbol} India`);
    const feedUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    try {
        const feed = await parser.parseURL(feedUrl);
        if (!feed.items || feed.items.length === 0) return [];

        const newsItems: NewsItem[] = feed.items.slice(0, limit).map((item) => {
            const headline = item.title || 'No headline';
            const link = item.link || 'https://news.google.com';
            const pubDate = item.pubDate
                ? new Date(item.pubDate).toISOString().split('T')[0]
                : 'Unknown';
            const score = vader.SentimentIntensityAnalyzer.polarity_scores(headline);

            return { headline, link, pubDate, score };
        });

        return newsItems;
    } catch (err) {
        console.error(`❌ Error fetching news or analyzing sentiment for "${symbol}":`, err);
        return [];
    }
}

