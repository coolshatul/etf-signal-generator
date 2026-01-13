import { updateSignalPerformance } from '../db/mongo';

export const handler = async (): Promise<void> => {
    console.log('📡 Starting daily performance update for open signals...');

    try {
        await updateSignalPerformance();
        console.log('✅ Performance update completed.');
    } catch (err) {
        console.error('❌ Error in performance update handler:', err);
    }
};
