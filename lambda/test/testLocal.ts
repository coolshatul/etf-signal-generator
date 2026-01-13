import { handler } from '../handlers/dailySignalEMACrossover';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    console.log('🧪 Starting local EMA Crossover signal test...');

    try {
        await handler();
        console.log('✅ Local EMA crossover test completed successfully.');
    } catch (err) {
        console.error('❌ Local EMA crossover test failed:', err);
    }
})();
