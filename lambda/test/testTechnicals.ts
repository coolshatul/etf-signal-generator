import { handleTechnicals } from '../telegram/commands/handleTechnicals';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config();

(async () => {
    console.log('🧪 Starting local technicals test...');

    try {
        // Use test bot token for local testing
        const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

        // Use your test chat ID
        const testChatId = parseInt(process.env.TELEGRAM_CHAT_ID!);

        // Test with a sample symbol
        const testSymbol = 'AXISBANK'; // or any NSE symbol

        console.log(`Testing technicals for ${testSymbol}...`);

        await handleTechnicals(bot, testChatId, testSymbol);

        console.log('✅ Technicals test completed successfully.');

    } catch (err) {
        console.error('❌ Technicals test failed:', err);
    }
})();
