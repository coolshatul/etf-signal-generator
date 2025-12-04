import { Telegraf } from 'telegraf';
import { connectToDatabase } from '../../db/connection';
import { Subscriber } from '../../db/models';

export async function handleUnsubscribe(bot: Telegraf<any>, chatId: number) {
    try {
        await connectToDatabase();

        // Check if user is subscribed
        const subscriber = await Subscriber.findOne({ chatId });

        if (!subscriber || !subscriber.isActive) {
            await bot.telegram.sendMessage(chatId, '❓ You are not currently subscribed to trading signals.');
            return;
        }

        // Deactivate subscription
        subscriber.isActive = false;
        subscriber.unsubscribedAt = new Date();
        await subscriber.save();

        await bot.telegram.sendMessage(chatId,
            '✅ Successfully unsubscribed from trading signals.\n\n' +
            'You will no longer receive daily alerts. You can resubscribe anytime with /subscribe.'
        );

        console.log(`📝 User ${chatId} unsubscribed from signals`);
    } catch (error) {
        console.error('Error unsubscribing user:', error);
        await bot.telegram.sendMessage(chatId, '❌ Sorry, there was an error unsubscribing you. Please try again later.');
    }
}
