import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { BullishStockResult } from '../types/index.js';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN!;
const chatId = process.env.TELEGRAM_CHAT_ID!;
const bot = new Telegraf(token);



export async function sendBullishStocksAlert(bullishResults: BullishStockResult[]): Promise<void> {
    if (bullishResults.length === 0) {
        const noSignalMessage = `
� *No Bullish Signals Today* �
� *Date:* ${new Date().toISOString().split('T')[0]}

� *Nifty50 Analysis Complete*
No stocks currently meet the bullish criteria (rating ≥ 5/8).

━━━━━━━━━━━━━━━━━━
⚠️ _This is not financial advice. Always do your own research._
        `.trim();

        try {
            await bot.telegram.sendMessage(chatId, noSignalMessage, { parse_mode: 'Markdown' });
            console.log('📬 Telegram alert sent: No bullish signals');
        } catch (err) {
            console.error('❌ Failed to send Telegram alert:', err);
        }
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    let message = `
🚀 *Bullish Stocks Alert* 🚀
📅 *Date:* ${today}
📊 *Analysis:* Nifty50 Stocks

━━━━━━━━━━━━━━━━━━
📈 *Found ${bullishResults.length} Bullish Stock(s) based on [Daily Close > 2 days ago Close] logic*

`;

    // Sort by rating (highest first) and limit to top 10 for message length
    const topStocks = bullishResults
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 10);

    topStocks.forEach((stock, index) => {
        message += `
${index + 1}. *${stock.symbol}* (Rating: ${stock.rating}/8)
   📍 Signals: ${stock.signals.join(', ')}
   � Stop Loss: ₹${stock.stopLoss.toFixed(2)} (${stock.stopLossPercent.toFixed(1)}%)
   🎯 Target: ₹${stock.target.toFixed(2)} (+${stock.targetPercent.toFixed(1)}%)
   📊 Risk/Reward: ${stock.riskRewardRatio.toFixed(1)}:1
`;
    });

    if (bullishResults.length > 10) {
        message += `\n... and ${bullishResults.length - 10} more bullish stocks\n`;
    }

    message += `
━━━━━━━━━━━━━━━━━━
🎯 *Strategy Criteria:*
- Price higher than 2 days ago
- Price above EMA20/50
- EMA20 > EMA50 structure
- RSI 40-60 + MACD positive
- Rating ≥ 5/8 points

⚠️ _This is not financial advice. Always do your own research._
    `.trim();

    try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`📬 Telegram alert sent for ${bullishResults.length} bullish stocks`);
    } catch (err) {
        console.error('❌ Failed to send Telegram alert:', err);
    }
}
