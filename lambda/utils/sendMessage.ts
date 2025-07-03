import { Telegraf } from 'telegraf';

/**
 * Escapes text for Telegram MarkdownV2.
 */
function escapeMarkdownV2(text: string): string {
    return text.replace(/([_*[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

/**
 * Sends a message to a Telegram user or group with multiple fallback layers:
 * 1. Try Markdown (v1)
 * 2. Fallback to MarkdownV2 with escaping
 * 3. Fallback plain text message if both fail
 * 
 * @param bot Telegraf bot instance
 * @param chatId Target chat ID
 * @param text Message content
 */
export async function sendMessage(
    bot: Telegraf<any>,
    chatId: number,
    text: string
) {
    try {
        // First Attempt: Markdown (v1)
        await bot.telegram.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
        });
    } catch (err1: any) {
        console.error(`❌ Failed with Markdown for chat ${chatId}`, err1);

        try {
            // Second Attempt: MarkdownV2 with escaping
            const escaped = escapeMarkdownV2(text);
            await bot.telegram.sendMessage(chatId, escaped, {
                parse_mode: 'MarkdownV2',
            });
        } catch (err2: any) {
            console.error(`❌ Failed with MarkdownV2 for chat ${chatId}`, err2);

            try {
                // Third Attempt: Fallback Plain Text
                await bot.telegram.sendMessage(
                    chatId,
                    '⚠️ Failed to send formatted message. There may be a Markdown formatting issue.'
                );
            } catch (err3: any) {
                console.error(`❌ Failed to send fallback message to ${chatId}`, err3);
            }
        }
    }
}
