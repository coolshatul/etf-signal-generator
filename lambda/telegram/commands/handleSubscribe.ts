import { Telegraf } from 'telegraf';
import { connectToDatabase } from '../../db/connection';
import { Subscriber } from '../../db/models';

export async function handleSubscribe(bot: Telegraf<any>, chatId: number, userInfo?: any) {
    try {
        await connectToDatabase();

        // Check if user is already subscribed
        const existingSubscriber = await Subscriber.findOne({ chatId });

        if (existingSubscriber && existingSubscriber.isActive) {
            await bot.telegram.sendMessage(chatId, '✅ You are already subscribed to trading signals!');
            return;
        }

        if (existingSubscriber && !existingSubscriber.isActive) {
            // Reactivate subscription
            existingSubscriber.isActive = true;
            existingSubscriber.unsubscribedAt = undefined;
            await existingSubscriber.save();
            await bot.telegram.sendMessage(chatId, '✅ Welcome back! You have been resubscribed to trading signals.');
        } else {
            // Create new subscription
            const subscriber = new Subscriber({
                chatId,
                username: userInfo?.username,
                firstName: userInfo?.first_name,
                lastName: userInfo?.last_name,
                isActive: true,
                subscribedAt: new Date()
            });

            await subscriber.save();
            await bot.telegram.sendMessage(chatId,
                '✅ Successfully subscribed to trading signals!\n\n' +
                'You will now receive:\n' +
                '🚀 Daily bullish stock alerts\n' +
                '📊 EMA36 breakout signals\n\n' +
                'Signals are sent weekdays at 9:00 AM IST.'
            );
        }

        console.log(`📝 User ${chatId} subscribed to signals`);
    } catch (error) {
        console.error('Error subscribing user:', error);
        await bot.telegram.sendMessage(chatId, '❌ Sorry, there was an error subscribing you. Please try again later.');
    }
}
