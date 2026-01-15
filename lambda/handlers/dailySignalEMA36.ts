import { analyzeNifty50EMA36 } from '../services/analyzeNifty50EMA36';
import { sendEMA36Alert } from '../alerts/telegram';
import { sendEMA36Email } from '../alerts/email';
import { logEMA36Signals } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';


export const handler = async (): Promise<void> => {
    console.log('📊 Starting daily Nifty50 EMA36 analysis...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping EMA36 analysis.');
        return;
    }

    try {
        const ema36Results = await analyzeNifty50EMA36();

        // Send Telegram Alert
        await sendEMA36Alert(ema36Results);

        // Send Email Alert
        await sendEMA36Email(ema36Results);

        // Log to DB
        await logEMA36Signals(ema36Results);

        console.log(`✅ Completed EMA36 analysis. Found ${ema36Results.length} signals.`);
    } catch (err) {
        console.error('❌ Error analyzing Nifty50 EMA36:', err);
    }

    console.log('🎯 Nifty50 EMA36 analysis completed.');
};
