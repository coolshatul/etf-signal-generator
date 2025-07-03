import * as dotenv from 'dotenv';
import { fetchFundamentalData } from '../services/fundamentals';

dotenv.config();

(async () => {
    console.log('🧪 Starting local fundamentals test...');

    try {
        const result = await fetchFundamentalData('INFY'); // Example ETF symbol
        console.log('✅ Fundamental data fetched successfully:', result);

        console.log('✅ Local test completed successfully.');
    } catch (err) {
        console.error('❌ Local test failed:', err);
    }
})();
