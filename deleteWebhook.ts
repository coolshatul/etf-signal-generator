import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function deleteWebhook() {
    const token = process.env.TELEGRAM_TOKEN!;

    if (!token) {
        console.error('❌ TELEGRAM_TOKEN not found in environment variables');
        return;
    }

    try {
        console.log('🗑️ Deleting webhook...');

        const response = await axios.post(`https://api.telegram.org/bot${token}/deleteWebhook`, {
            drop_pending_updates: true
        });

        if (response.data.ok) {
            console.log('✅ Webhook deleted successfully!');

            // Verify the webhook was deleted
            const infoResponse = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
            console.log('🔍 Webhook Info after deletion:', JSON.stringify(infoResponse.data.result, null, 2));
        } else {
            console.error('❌ Failed to delete webhook:', response.data);
        }
    } catch (error) {
        console.error('❌ Error deleting webhook:', error);
    }
}

deleteWebhook();
