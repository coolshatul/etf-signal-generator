import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function setWebhook() {
    const token = process.env.TELEGRAM_TOKEN!;
    const webhookUrl = 'https://updamyuk4a.execute-api.ap-south-1.amazonaws.com/prod/webhook';

    if (!token) {
        console.error('❌ TELEGRAM_TOKEN not found in environment variables');
        return;
    }

    try {
        console.log('🔧 Setting webhook URL:', webhookUrl);

        const response = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, {
            url: webhookUrl,
            allowed_updates: ['message']
        });

        if (response.data.ok) {
            console.log('✅ Webhook set successfully!');
            console.log('📡 Webhook URL:', webhookUrl);

            // Verify the webhook was set
            const infoResponse = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
            console.log('🔍 Webhook Info:', JSON.stringify(infoResponse.data.result, null, 2));
        } else {
            console.error('❌ Failed to set webhook:', response.data);
        }
    } catch (error) {
        console.error('❌ Error setting webhook:', error);
    }
}

setWebhook();
