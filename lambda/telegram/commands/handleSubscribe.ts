import { Telegraf } from 'telegraf';
import { connectToDatabase } from '../../db/connection';
import { Subscriber } from '../../db/models';

export async function handleSubscribe(bot: Telegraf<any>, chatId: number, userInfo?: any) {
    console.log(`🔍 SUBSCRIBE DEBUG: Starting subscription for chatId: ${chatId}`);
    console.log(`🔍 SUBSCRIBE DEBUG: User info:`, JSON.stringify(userInfo, null, 2));
    console.log(`🔍 SUBSCRIBE DEBUG: Environment check - MONGODB_URI exists:`, !!process.env.MONGODB_URI);

    try {
        console.log(`🔍 SUBSCRIBE DEBUG: Attempting database connection...`);
        await connectToDatabase();
        console.log(`✅ SUBSCRIBE DEBUG: Database connected successfully`);

        console.log(`🔍 SUBSCRIBE DEBUG: Checking for existing subscriber...`);
        const existingSubscriber = await Subscriber.findOne({ chatId });
        console.log(`🔍 SUBSCRIBE DEBUG: Existing subscriber found:`, !!existingSubscriber);

        if (existingSubscriber) {
            console.log(`🔍 SUBSCRIBE DEBUG: Existing subscriber status - isActive: ${existingSubscriber.isActive}`);
        }

        if (existingSubscriber && existingSubscriber.isActive) {
            console.log(`🔍 SUBSCRIBE DEBUG: User already active, sending message...`);
            await bot.telegram.sendMessage(chatId, '✅ You are already subscribed to trading signals!');
            console.log(`✅ SUBSCRIBE DEBUG: Already subscribed message sent`);
            return;
        }

        if (existingSubscriber && !existingSubscriber.isActive) {
            console.log(`🔍 SUBSCRIBE DEBUG: Reactivating existing subscriber...`);
            // Reactivate subscription
            existingSubscriber.isActive = true;
            existingSubscriber.unsubscribedAt = undefined;
            await existingSubscriber.save();
            console.log(`✅ SUBSCRIBE DEBUG: Subscriber reactivated in database`);

            console.log(`🔍 SUBSCRIBE DEBUG: Sending reactivation message...`);
            await bot.telegram.sendMessage(chatId, '✅ Welcome back! You have been resubscribed to trading signals.');
            console.log(`✅ SUBSCRIBE DEBUG: Reactivation message sent`);
        } else {
            console.log(`🔍 SUBSCRIBE DEBUG: Creating new subscriber...`);
            // Create new subscription
            const subscriber = new Subscriber({
                chatId,
                username: userInfo?.username,
                firstName: userInfo?.first_name,
                lastName: userInfo?.last_name,
                isActive: true,
                subscribedAt: new Date()
            });

            console.log(`🔍 SUBSCRIBE DEBUG: Saving new subscriber to database...`);
            await subscriber.save();
            console.log(`✅ SUBSCRIBE DEBUG: New subscriber saved to database`);

            console.log(`🔍 SUBSCRIBE DEBUG: Sending success message...`);
            await bot.telegram.sendMessage(chatId,
                '✅ Successfully subscribed to trading signals!\n\n' +
                'You will now receive:\n' +
                '🚀 Daily bullish stock alerts\n' +
                '📊 EMA36 breakout signals\n\n' +
                'Signals are sent weekdays at 9:00 AM IST.'
            );
            console.log(`✅ SUBSCRIBE DEBUG: Success message sent`);
        }

        console.log(`📝 User ${chatId} subscribed to signals`);
    } catch (error) {
        console.error('❌ SUBSCRIBE DEBUG: Error subscribing user:', error);
        console.error('❌ SUBSCRIBE DEBUG: Error details:', JSON.stringify(error, null, 2));

        try {
            console.log(`🔍 SUBSCRIBE DEBUG: Attempting to send error message...`);
            await bot.telegram.sendMessage(chatId, '❌ Sorry, there was an error subscribing you. Please try again later.');
            console.log(`✅ SUBSCRIBE DEBUG: Error message sent successfully`);
        } catch (msgError) {
            console.error('❌ SUBSCRIBE DEBUG: Failed to send error message:', msgError);
        }
    }
}
