import { handler } from '../handlers/dailySignal';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    console.log('🧪 Starting local ETF signal test...');

    try {
        await handler();
        console.log('✅ Local test completed successfully.');
    } catch (err) {
        console.error('❌ Local test failed:', err);
    }
})();
