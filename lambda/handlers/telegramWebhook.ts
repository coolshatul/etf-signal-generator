import { APIGatewayProxyHandler } from 'aws-lambda';
import { Telegraf } from 'telegraf';
import { handleStart } from '../telegram/commands/handleStart';
import { handleHelp } from '../telegram/commands/handleHelp';
import { handleTechnicals } from '../telegram/commands/handleTechnicals';
import { handleFundamentals } from '../telegram/commands/handleFundamentals';
import { handleNews } from '../telegram/commands/handleNews';
import { handleSubscribe } from '../telegram/commands/handleSubscribe';
import { handleUnsubscribe } from '../telegram/commands/handleUnsubscribe';
import { handleSubscribers } from '../telegram/commands/handleSubscribers';


const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

export const handler: APIGatewayProxyHandler = async (event) => {
    const body = JSON.parse(event.body || '{}');
    const message = body.message;
    if (!message || !message.text) return { statusCode: 200, body: 'Ignored' };

    const chatId = message.chat.id;
    const text = message.text.trim();
    const [command, ...args] = text.split(' ');
    const symbolArg = args[0];

    switch (command) {
        case '/start':
            await handleStart(bot, chatId);
            break;
        case '/help':
            await handleHelp(bot, chatId);
            break;
        case '/subscribe':
            await handleSubscribe(bot, chatId, message.from);
            break;
        case '/unsubscribe':
            await handleUnsubscribe(bot, chatId);
            break;
        case '/subscribers':
            await handleSubscribers(bot, chatId);
            break;

        case '/technicals':
            if (symbolArg) await handleTechnicals(bot, chatId, symbolArg.toUpperCase());
            else await bot.telegram.sendMessage(chatId, '⚠️ Usage: /technicals SYMBOL');
            break;
        case '/fundamentals':
            if (symbolArg) await handleFundamentals(bot, chatId, symbolArg.toUpperCase());
            else await bot.telegram.sendMessage(chatId, '⚠️ Usage: /fundamentals SYMBOL');
            break;
        case '/news':
            const limitArg = args[1];
            if (!symbolArg) {
                await bot.telegram.sendMessage(chatId, '⚠️ Usage: /news SYMBOL [LIMIT]');
                break;
            }
            const limit = Math.min(limitArg ? parseInt(limitArg, 10) : 5, 20);  // max 20 headlines
            await handleNews(bot, chatId, symbolArg.toUpperCase(), limit);
            break;
        default:
            await bot.telegram.sendMessage(chatId, '❓ Unknown command. Try /help');
    }

    return { statusCode: 200, body: 'OK' };
};
