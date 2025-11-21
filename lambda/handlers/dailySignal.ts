import { analyzeNifty50Bullish } from '../services/analyzeNifty50Bullish';
import { sendBullishStocksAlert } from '../alerts/telegram';
import { sendBullishStocksEmail } from '../alerts/email';
// import { logToMongo } from '../db/mongo'; // Optional


export const handler = async (): Promise<void> => {
    console.log('📡 Starting daily Nifty50 bullish stocks scan...');

    try {
        const bullishResults = await analyzeNifty50Bullish();

        // Send Telegram Alert
        await sendBullishStocksAlert(bullishResults);

        // Send Email Alert
        await sendBullishStocksEmail(bullishResults);

        // Log to DB (optional)
        // await logToMongo(bullishResults);

        console.log(`✅ Completed bullish stocks analysis. Found ${bullishResults.length} bullish stocks.`);
    } catch (err) {
        console.error('❌ Error analyzing Nifty50 stocks:', err);
    }

    console.log('🎯 Nifty50 bullish stocks analysis completed.');
};
