import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { BullishStockResult, EMA36Result } from '../types/index.js';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN!;
const chatId = process.env.TELEGRAM_CHAT_ID!;
const bot = new Telegraf(token);

// Constants
const TELEGRAM_CONFIG = {
    MAX_MESSAGE_LENGTH: 4096,
    MAX_STOCKS_DISPLAY: 10,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000
};

const MESSAGES = {
    DISCLAIMER: '⚠️ _This is not financial advice. Always do your own research._',
    SEPARATOR: '━━━━━━━━━━━━━━━━━━'
};

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

        await sendMessageWithRetry(noSignalMessage);
        console.log('📬 Telegram alert sent: No bullish signals');
        return;
    }

    const today = getCurrentDate();

    let message = `
🚀 *Bullish Stocks Alert* 🚀
📅 *Date:* ${today}
📊 *Analysis:* Nifty50 Stocks

${MESSAGES.SEPARATOR}
📈 *Found ${bullishResults.length} Bullish Stock(s) based on [Daily Close > 2 days ago Close] logic*

`;

    // Sort by rating (highest first) and limit to top stocks for message length
    const topStocks = bullishResults
        .sort((a, b) => b.rating - a.rating)
        .slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);

    topStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        message += `
${index + 1}. *${stock.symbol}* [tradingview link 📊](${tvLink}) (Rating: ${stock.rating}/8)
   📍 Signals: ${stock.signals.join(', ')}
   🛡️ Stop Loss: ₹${stock.stopLoss.toFixed(2)} (${stock.stopLossPercent.toFixed(1)}%)
   🎯 Target: ₹${stock.target.toFixed(2)} (+${stock.targetPercent.toFixed(1)}%)
   📊 Risk/Reward: ${stock.riskRewardRatio.toFixed(1)}:1
`;
    });

    if (bullishResults.length > TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY) {
        message += `\n... and ${bullishResults.length - TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY} more bullish stocks\n`;
    }

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

    await sendLongMessage(message);
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

        await sendMessageWithRetry(noSignalMessage);
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

`;

    // Show approaching breakout stocks
    const displayStocks = ema36Results.slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);
    displayStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        message += `${index + 1}. *${stock.symbol}* [tradingview link 📊](${tvLink})\n`;
        message += `   💰 LTP: ₹${stock.ltp.toFixed(2)} | EMA36: ₹${stock.ema36.toFixed(2)}\n`;
        message += `   📊 Diff: ${stock.percentDiff.toFixed(2)}%\n\n`;
    });

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

    await sendLongMessage(message);
    console.log(`📬 Telegram alert sent for ${ema36Results.length} EMA36 signals`);
}
