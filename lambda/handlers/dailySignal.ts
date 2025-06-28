import { analyzeETF } from '../services/analyzeETF';
import { sendTelegramAlert } from '../alerts/telegram';
import { SUPPORTED_ETFS } from '../config/settings';
// import { logToMongo } from '../db/mongo'; // Optional


export const handler = async (): Promise<void> => {
    console.log('📡 Starting daily ETF signal scan...');

    for (const symbol of SUPPORTED_ETFS) {
        try {
            const result = await analyzeETF(symbol);

            // Send Telegram Alert
            await sendTelegramAlert(result);

            // Log to DB (optional)
            // await logToMongo(result);

            console.log(`✅ Completed signal check for ${symbol}`);
        } catch (err) {
            console.error(`❌ Error analyzing ${symbol}:`, err);
        }
    }

    console.log('🎯 All ETF signals processed.');
};
