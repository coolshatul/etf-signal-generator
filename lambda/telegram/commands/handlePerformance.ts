import { Telegraf } from 'telegraf';
import { Signal } from '../../db/models';
import { connectToDatabase } from '../../db/connection';
import { sendMessage } from '../../utils/sendMessage';
import { MESSAGES } from '../../utils/common';

export async function handlePerformance(bot: Telegraf, chatId: number): Promise<void> {
    try {
        await connectToDatabase();

        // Fetch recent signals (last 30 days) to show performance
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const signals = await Signal.find({
            date: { $gte: thirtyDaysAgo }
        }).sort({ date: -1 });

        if (!signals.length) {
            await sendMessage(bot, chatId, '📭 No signals generated in the last 30 days.');
            return;
        }

        const openSignals = signals.filter(s => s.status === 'OPEN');
        const closedSignals = signals.filter(s => s.status !== 'OPEN');

        const winRate = closedSignals.length > 0
            ? (closedSignals.filter(s => s.status === 'HIT_TARGET').length / closedSignals.length) * 100
            : 0;

        let response = `📈 *Strategy Performance (Last 30 Days)*\n${MESSAGES.SEPARATOR}\n\n`;

        response += `🎯 *Stats:*
- Total Signals: ${signals.length}
- Won: ${closedSignals.filter(s => s.status === 'HIT_TARGET').length}
- Lost: ${closedSignals.filter(s => s.status === 'HIT_SL').length}
- Win Rate: \`${winRate.toFixed(1)}%\`
\n`;

        if (openSignals.length > 0) {
            response += `📂 *Active Trades:*
`;
            openSignals.slice(0, 10).forEach(s => {
                const perf = s.performancePercent || 0;
                const emoji = perf >= 0 ? '📈' : '📉';
                response += `- **${s.symbol}**: \`${perf >= 0 ? '+' : ''}${perf.toFixed(1)}%\` ${emoji} (Entry: ₹${s.price})\n`;
            });
            if (openSignals.length > 10) response += `... and ${openSignals.length - 10} more\n`;
        }

        response += `\n${MESSAGES.DISCLAIMER}`;

        await sendMessage(bot, chatId, response);
    } catch (err) {
        console.error('❌ Error fetching performance:', err);
        await sendMessage(bot, chatId, '❌ Failed to fetch strategy performance.');
    }
}
