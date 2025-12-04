import { Telegraf } from 'telegraf';
import { connectToDatabase } from '../../db/connection';
import { Subscriber } from '../../db/models';

const ADMIN_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID || '0');

export async function handleSubscribers(bot: Telegraf<any>, chatId: number) {
    // Only allow admin (original chat ID) to use this command
    if (chatId !== ADMIN_CHAT_ID) {
        await bot.telegram.sendMessage(chatId, '❌ This command is only available to administrators.');
        return;
    }

    try {
        await connectToDatabase();

        // Get subscriber statistics
        const totalSubscribers = await Subscriber.countDocuments();
        const activeSubscribers = await Subscriber.countDocuments({ isActive: true });
        const inactiveSubscribers = totalSubscribers - activeSubscribers;

        // Get recent subscribers (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentSubscribers = await Subscriber.countDocuments({
            subscribedAt: { $gte: sevenDaysAgo },
            isActive: true
        });

        const message = `
📊 *Subscriber Statistics*

👥 *Total Subscribers:* ${totalSubscribers}
✅ *Active Subscribers:* ${activeSubscribers}
❌ *Inactive Subscribers:* ${inactiveSubscribers}
🆕 *New This Week:* ${recentSubscribers}

${MESSAGES.SEPARATOR}
*Active Subscriber Chat IDs:*
${await getActiveSubscriberList()}
        `.trim();

        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error getting subscriber stats:', error);
        await bot.telegram.sendMessage(chatId, '❌ Error retrieving subscriber statistics.');
    }
}

async function getActiveSubscriberList(): Promise<string> {
    try {
        const activeSubscribers = await Subscriber.find({ isActive: true })
            .select('chatId username firstName subscribedAt')
            .sort({ subscribedAt: -1 })
            .limit(20); // Limit to prevent message being too long

        if (activeSubscribers.length === 0) {
            return 'No active subscribers';
        }

        return activeSubscribers.map(sub => {
            const name = sub.username || `${sub.firstName || ''} ${sub.lastName || ''}`.trim() || 'Unknown';
            const date = sub.subscribedAt.toLocaleDateString();
            return `• \`${sub.chatId}\` - ${name} (${date})`;
        }).join('\n');
    } catch (error) {
        console.error('Error getting subscriber list:', error);
        return 'Error loading subscriber list';
    }
}

// Import MESSAGES from common utils
const MESSAGES = {
    SEPARATOR: '—'
};
