import { handleTechnicals } from '../telegram/commands/handleTechnicals';
import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config();

// Mock the sendMessage function to avoid sending actual messages
const originalSendMessage = require('../utils/sendMessage').sendMessage;
require('../utils/sendMessage').sendMessage = async (bot: Telegraf, chatId: number, message: string) => {
    console.log(`📤 Would send to chat ${chatId}:`);
    console.log(message);
    console.log('---');
};

(async () => {
    console.log('🧪 Starting local technicals test (mocked)...');

    try {
        const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);
        const testChatId = 123456789; // dummy chat ID
        const testSymbol = 'RELIANCE';

        console.log(`Testing technicals for ${testSymbol}...`);

        await handleTechnicals(bot, testChatId, testSymbol);

        console.log('✅ Technicals test completed successfully.');

    } catch (err) {
        console.error('❌ Technicals test failed:', err);
    } finally {
        // Restore original function
        require('../utils/sendMessage').sendMessage = originalSendMessage;
    }
})();
