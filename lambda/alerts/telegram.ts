import { Telegraf, Markup } from 'telegraf';
import * as dotenv from 'dotenv';
import { BullishStockResult, EMA36Result } from '../types/index.js';
import { TELEGRAM_CONFIG, MESSAGES } from '../utils/common';
import { connectToDatabase } from '../db/connection';
import { Subscriber } from '../db/models';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN!;
const chatId = process.env.TELEGRAM_CHAT_ID!;
const bot = new Telegraf(token);


// Helper functions
function getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
}

function validateInputs(results: any[], type: string): void {
    if (!Array.isArray(results)) {
        throw new Error(`Invalid input: ${type} results must be an array`);
    }
    if (!token || !chatId) {
        throw new Error('Telegram configuration missing: TOKEN or CHAT_ID not set');
    }
}

async function sendMessageWithRetry(message: string, options: any = {}): Promise<void> {
    for (let attempt = 1; attempt <= TELEGRAM_CONFIG.RETRY_ATTEMPTS; attempt++) {
        try {
            await bot.telegram.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                link_preview_options: { is_disabled: true },
                ...options
            });
            console.log(`📬 Telegram message sent successfully (attempt ${attempt})`);
            return;
        } catch (err) {
            console.error(`❌ Telegram send attempt ${attempt} failed:`, err);
            if (attempt < TELEGRAM_CONFIG.RETRY_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, TELEGRAM_CONFIG.RETRY_DELAY_MS));
            } else {
                throw new Error(`Failed to send Telegram message after ${TELEGRAM_CONFIG.RETRY_ATTEMPTS} attempts`);
            }
        }
    }
}

function splitMessage(message: string): string[] {
    if (message.length <= TELEGRAM_CONFIG.MAX_MESSAGE_LENGTH) {
        return [message];
    }

    const messages: string[] = [];
    let currentMessage = '';

    const lines = message.split('\n');
    for (const line of lines) {
        if ((currentMessage + line + '\n').length > TELEGRAM_CONFIG.MAX_MESSAGE_LENGTH) {
            if (currentMessage) {
                messages.push(currentMessage.trim());
                currentMessage = '';
            }
            // If a single line is too long, truncate it (though unlikely for our use case)
            if (line.length > TELEGRAM_CONFIG.MAX_MESSAGE_LENGTH) {
                messages.push(line.substring(0, TELEGRAM_CONFIG.MAX_MESSAGE_LENGTH - 3) + '...');
            } else {
                currentMessage = line + '\n';
            }
        } else {
            currentMessage += line + '\n';
        }
    }

    if (currentMessage) {
        messages.push(currentMessage.trim());
    }

    return messages;
}

async function sendLongMessage(fullMessage: string): Promise<void> {
    const messages = splitMessage(fullMessage);
    for (const message of messages) {
        await sendMessageWithRetry(message);
    }
}

async function getActiveSubscribers(): Promise<number[]> {
    try {
        await connectToDatabase();
        const subscribers = await Subscriber.find({ isActive: true }).select('chatId');
        return subscribers.map(sub => sub.chatId);
    } catch (error) {
        console.error('Error getting active subscribers:', error);
        // Fallback to original chat ID if database fails
        return [parseInt(chatId)];
    }
}

async function broadcastMessage(message: string, options: any = {}): Promise<void> {
    const subscriberChatIds = await getActiveSubscribers();
    console.log(`📢 Broadcasting to ${subscriberChatIds.length} subscribers`);

    const messages = splitMessage(message);
    let successCount = 0;
    let failureCount = 0;

    for (const chatId of subscriberChatIds) {
        for (const msg of messages) {
            for (let attempt = 1; attempt <= TELEGRAM_CONFIG.RETRY_ATTEMPTS; attempt++) {
                try {
                    await bot.telegram.sendMessage(chatId, msg, {
                        parse_mode: 'Markdown',
                        link_preview_options: { is_disabled: true },
                        ...options
                    });
                    successCount++;
                    break; // Success, move to next subscriber
                } catch (err) {
                    console.error(`❌ Broadcast attempt ${attempt} failed for chat ${chatId}:`, err);
                    if (attempt < TELEGRAM_CONFIG.RETRY_ATTEMPTS) {
                        await new Promise(resolve => setTimeout(resolve, TELEGRAM_CONFIG.RETRY_DELAY_MS));
                    } else {
                        failureCount++;
                        // If it's the original admin chat, mark as inactive
                        if (chatId === parseInt(process.env.TELEGRAM_CHAT_ID || '0')) {
                            console.error('❌ Failed to send to admin chat - check bot configuration');
                        } else {
                            // Optionally mark subscriber as inactive if we can't reach them
                            try {
                                await Subscriber.findOneAndUpdate(
                                    { chatId },
                                    { isActive: false, unsubscribedAt: new Date() }
                                );
                                console.log(`📝 Marked subscriber ${chatId} as inactive due to delivery failure`);
                            } catch (dbError) {
                                console.error('Error updating subscriber status:', dbError);
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`📬 Broadcast complete: ${successCount} successful, ${failureCount} failed`);
}

export async function sendBullishStocksAlert(bullishResults: BullishStockResult[]): Promise<void> {
    validateInputs(bullishResults, 'bullish');

    if (bullishResults.length === 0) {
        const noSignalMessage = `
🔔 *No Bullish Signals Today* 🔔
📅 *Date:* ${getCurrentDate()}

📊 *Nifty50 Analysis Complete*
No stocks currently meet the bullish criteria (rating ≥ 5/8).

${MESSAGES.SEPARATOR}
${MESSAGES.DISCLAIMER}
        `.trim();

        await broadcastMessage(noSignalMessage);
        console.log('📬 Telegram alert sent: No bullish signals');
        return;
    }

    const today = getCurrentDate();

    const isMarketBearish = bullishResults.some(r => r.marketRegimeBullish === false);
    const marketStatus = isMarketBearish
        ? '⚠️ *BEARISH MARKET REGIME* ⚠️\n(Only high-conviction signals allowed)\n'
        : '✅ *BULLISH MARKET REGIME*';

    let message = `
🚀 *Bullish Stocks Alert* 🚀
📅 *Date:* ${today}
🌍 *Market:* ${marketStatus}
📊 *Analysis:* Nifty50 Stocks
${MESSAGES.SEPARATOR}
📈 *Found ${bullishResults.length} Bullish Stock(s)*
${MESSAGES.SEPARATOR}

`;

    // Sort by rating (highest first) and limit to top stocks for message length
    const topStocks = bullishResults
        .sort((a, b) => b.rating - a.rating)
        .slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);

    topStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        const stockMessage = `${index + 1}. **${stock.symbol}** (Rating: ${stock.rating}/8)
   📍 Signals: ${stock.signals.join(', ')}
   🛡️ Stop Loss: ₹\`${stock.stopLoss.toFixed(2)}\` (\`${stock.stopLossPercent.toFixed(1)}%\`)
   🎯 Target: ₹\`${stock.target.toFixed(2)}\` (+\`${stock.targetPercent.toFixed(1)}%\`)
   📊 Risk/Reward: \`${stock.riskRewardRatio.toFixed(1)}\`:1
   📈 [View Chart](${tvLink})

`;
        message += stockMessage;
    });

    const buttons = topStocks.map(stock => [
        Markup.button.callback(`🔍 AI Analysis: ${stock.symbol}`, `analyze_${stock.symbol}`),
        Markup.button.callback(`📰 News: ${stock.symbol}`, `news_${stock.symbol}`)
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    message += `
${MESSAGES.SEPARATOR}
🎯 *Strategy Criteria:*
- Price higher than 2 days ago
- Price above EMA20/50
- EMA20 > EMA50 structure
- RSI 40-60 + MACD positive
- Rating ≥ 5/8 points

${MESSAGES.DISCLAIMER}
    `.trim();

    await broadcastMessage(message, keyboard);
    console.log(`📬 Telegram alert sent for ${bullishResults.length} bullish stocks`);
}

export async function sendEMA36Alert(ema36Results: EMA36Result[]): Promise<void> {
    validateInputs(ema36Results, 'EMA36');

    if (ema36Results.length === 0) {
        const noSignalMessage = `
📉 *No EMA36 Signals Today* 📉
📅 *Date:* ${getCurrentDate()}

📊 *Nifty50 EMA36 Analysis Complete*
No stocks currently below or near the 36-period EMA.

${MESSAGES.SEPARATOR}
${MESSAGES.DISCLAIMER}
        `.trim();

        await broadcastMessage(noSignalMessage);
        console.log('📬 Telegram alert sent: No EMA36 signals');
        return;
    }

    const today = getCurrentDate();

    let message = `
📊 *EMA36 Analysis Alert* 📊
📅 *Date:* ${today}
📈 *Analysis:* Nifty50 Stocks (36-week EMA on Weekly Candles)
${MESSAGES.SEPARATOR}
📉 *Found ${ema36Results.length} Stock(s) Approaching EMA36 Breakout*
${MESSAGES.SEPARATOR}

`;

    // Show approaching breakout stocks
    const displayStocks = ema36Results.slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);
    displayStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        message += `${index + 1}. **${stock.symbol}**
   💰 LTP: ₹\`${stock.ltp.toFixed(2)}\` | EMA36: ₹\`${stock.ema36.toFixed(2)}\`
   📊 Diff: \`${stock.percentDiff.toFixed(2)}%\`
   📈 [View Chart](${tvLink})

`;
    });

    const buttons = displayStocks.map(stock => [
        Markup.button.callback(`🔍 AI Analysis: ${stock.symbol}`, `analyze_${stock.symbol}`),
        Markup.button.callback(`📰 News: ${stock.symbol}`, `news_${stock.symbol}`)
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ema36Results.length > TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY) {
        message += `... and ${ema36Results.length - TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY} more stocks\n\n`;
    }

    message += `${MESSAGES.SEPARATOR}
🎯 *EMA36 Strategy:*
- Stocks below 36-week EMA but within 2%
- Approaching potential breakout from below
- Weekly trend analysis for longer-term signals

${MESSAGES.DISCLAIMER}
    `.trim();

    await broadcastMessage(message, keyboard);
    console.log(`📬 Telegram alert sent for ${ema36Results.length} EMA36 signals`);
}
