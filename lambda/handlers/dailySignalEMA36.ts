import { analyzeNifty50EMA36 } from '../services/analyzeNifty50EMA36';
import { sendEMA36Alert } from '../alerts/telegram';
// import { logToMongo } from '../db/mongo'; // Optional


export const handler = async (): Promise<void> => {
    console.log('📊 Starting daily Nifty50 EMA36 analysis...');

    try {
        const ema36Results = await analyzeNifty50EMA36();

        // Send Telegram Alert
        await sendEMA36Alert(ema36Results);

        // Log to DB (optional)
        // await logToMongo(ema36Results);

        console.log(`✅ Completed EMA36 analysis. Found ${ema36Results.length} signals.`);
    } catch (err) {
        console.error('❌ Error analyzing Nifty50 EMA36:', err);
    }

    console.log('🎯 Nifty50 EMA36 analysis completed.');
};
