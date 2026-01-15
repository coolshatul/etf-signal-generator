import { analyzeNifty50EMACrossover } from '../services/analyzeNifty50EMACrossover';
import { sendEMACrossoverAlert } from '../alerts/telegram';
import { sendEMACrossoverEmail } from '../alerts/email';
import { logEMACrossoverSignals } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';


export const handler = async (): Promise<void> => {
    console.log('📊 Starting daily Nifty50 EMA crossover analysis...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping EMA crossover analysis.');
        return;
    }

    try {
        const emaCrossoverResults = await analyzeNifty50EMACrossover();

        console.log(`✅ Completed EMA crossover analysis. Found ${emaCrossoverResults.length} signals.`);

        // Only send alerts and log if signals are found
        if (emaCrossoverResults.length > 0) {
            // Send Telegram Alert
            await sendEMACrossoverAlert(emaCrossoverResults);

            // Send Email Alert
            await sendEMACrossoverEmail(emaCrossoverResults);

            // Log to DB
            await logEMACrossoverSignals(emaCrossoverResults);

            console.log(`📬 Sent alerts for ${emaCrossoverResults.length} EMA crossover signals.`);
        } else {
            console.log('📭 No EMA crossover signals found - skipping alerts.');
        }
    } catch (err) {
        console.error('❌ Error analyzing Nifty50 EMA crossovers:', err);
    }

    console.log('🎯 Nifty50 EMA crossover analysis completed.');
};
