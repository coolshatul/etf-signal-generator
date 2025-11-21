import { handler } from '../handlers/dailySignalEMA36';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    console.log('🧪 Starting local EMA36 signal test...');

    try {
        await handler();
        console.log('✅ Local EMA36 test completed successfully.');
    } catch (err) {
        console.error('❌ Local EMA36 test failed:', err);
    }
})();
