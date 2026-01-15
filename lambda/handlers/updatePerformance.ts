import { updateSignalPerformance } from '../db/mongo';
import { isTodayHoliday } from '../utils/holidays';

export const handler = async (): Promise<void> => {
    console.log('📡 Starting daily performance update for open signals...');

    // Check if today is an NSE holiday
    if (isTodayHoliday()) {
        console.log('🏖️ Today is an NSE holiday. Skipping performance update.');
        return;
    }

    try {
        await updateSignalPerformance();
        console.log('✅ Performance update completed.');
    } catch (err) {
        console.error('❌ Error in performance update handler:', err);
    }
};
