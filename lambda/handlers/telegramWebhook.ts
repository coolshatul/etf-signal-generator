import { APIGatewayProxyHandler } from 'aws-lambda';
import { Telegraf } from 'telegraf';
import { handleStart } from '../telegram/commands/handleStart';
import { handleHelp } from '../telegram/commands/handleHelp';
import { handleSummary } from '../telegram/commands/handleSummary';
import { handleTechnicals } from '../telegram/commands/handleTechnicals';
import { handleFundamentals } from '../telegram/commands/handleFundamentals';


const bot = new Telegraf(process.env.TELEGRAM_TOKEN!);

export const handler: APIGatewayProxyHandler = async (event) => {
    const body = JSON.parse(event.body || '{}');
    const message = body.message;
    if (!message || !message.text) return { statusCode: 200, body: 'Ignored' };

    const chatId = message.chat.id;
    const text = message.text.trim();
    const [command, arg] = text.split(' ');

    switch (command) {
        case '/start':
            await handleStart(bot, chatId);
            break;
        case '/help':
            await handleHelp(bot, chatId);
            break;
        case '/summary':
            if (arg) await handleSummary(bot, chatId, arg.toUpperCase());
            else await bot.telegram.sendMessage(chatId, '⚠️ Usage: /summary SYMBOL');
            break;
        case '/technicals':
            if (arg) await handleTechnicals(bot, chatId, arg.toUpperCase());
            else await bot.telegram.sendMessage(chatId, '⚠️ Usage: /technicals SYMBOL');
            break;
        case '/fundamentals':
            if (arg) await handleFundamentals(bot, chatId, arg.toUpperCase());
            else await bot.telegram.sendMessage(chatId, '⚠️ Usage: /fundamentals SYMBOL');
            break;
        default:
            await bot.telegram.sendMessage(chatId, '❓ Unknown command. Try /help');
    }

    return { statusCode: 200, body: 'OK' };
};
