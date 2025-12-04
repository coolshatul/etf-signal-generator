import { handler } from './lambda/handlers/telegramWebhook';

// Test the webhook handler with a sample message
async function testWebhook() {
    console.log('🧪 Testing webhook handler locally...\n');

    // Sample message from Telegram
    const testEvent = {
        body: JSON.stringify({
            message: {
                chat: { id: 123456789 },
                text: '/help',
                from: {
                    username: 'testuser',
                    first_name: 'Test',
                    last_name: 'User'
                }
            }
        })
    };

    try {
        const result = await handler(testEvent as any, {} as any, {} as any);
        console.log('✅ Handler result:', result);
    } catch (error) {
        console.error('❌ Handler error:', error);
    }
}

testWebhook();
