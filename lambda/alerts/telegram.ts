import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { StrategyResult } from '../types/index.js';
import { STRATEGY_SETTINGS } from '../config/settings';

dotenv.config();

const token = process.env.TELEGRAM_TOKEN!;
const chatId = process.env.TELEGRAM_CHAT_ID!;
const bot = new Telegraf(token);

export async function sendTelegramAlert(result: StrategyResult): Promise<void> {
    const { symbol, signal, price, rsi, emaFast, emaSlow, date, reason, lastTrade, backtestStats } = result;

    const message = `
🚨 *Swing Trade Signal Alert* 🚨
📅 *Date:* ${date}
📊 *ETF:* ${symbol}

━━━━━━━━━━━━━━━━━━
📍 *Signal Today:* *${signal}*
💰 *Current Price:* ₹${price.toFixed(2)}

${lastTrade ? `
📦 *Last Trade:* ${lastTrade.type} on ${lastTrade.date} at ₹${lastTrade.price.toFixed(2)}
📈 *Change Since:* ${lastTrade.changeSince} (after exit)` : `
📦 *Last Trade:* N/A`
        }

📈 *Indicators:*
- RSI: *${rsi.toFixed(2)}* ${rsi > 50 ? '📈 (Bullish)' : '📉 (Bearish)'}
- EMA(9): *${emaFast.toFixed(2)}*
- EMA(21): *${emaSlow.toFixed(2)}*

🎯 *Strategy Settings:*
- Target Profit: ${STRATEGY_SETTINGS.takeProfit}%
- Stop Loss: ${STRATEGY_SETTINGS.stopLoss}%
- Trailing SL: ${STRATEGY_SETTINGS.trailingStop}% after ${STRATEGY_SETTINGS.trailingTrigger}% gain

🧠 *Why this signal?*
${reason}

${backtestStats ? `
📊 *Backtest Summary:*
- Days Tested: ${STRATEGY_SETTINGS.backtestDays}
- Trades: ${backtestStats.totalTrades}
- Profit: ${backtestStats.totalProfit}
- Annual Return: ${backtestStats.annualReturn}
- Win Rate: ${backtestStats.winRate}
` : ''}

━━━━━━━━━━━━━━━━━━
⚠️ _This is not financial advice. Always do your own research._
`.trim();


    try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`📬 Telegram alert sent for ${symbol}`);
    } catch (err) {
        console.error('❌ Failed to send Telegram alert:', err);
    }
}
