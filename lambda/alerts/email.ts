import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { BullishStockResult, EMA36Result, EMACrossoverResult } from '../types/index.js';
import { TELEGRAM_CONFIG, MESSAGES } from '../utils/common';

dotenv.config();

const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'gmail',
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASS!,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER!,
    to: process.env.EMAIL_TO!
};

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: emailConfig.service,
        auth: {
            user: emailConfig.user,
            pass: emailConfig.pass
        }
    });
};

// Helper function to get current date
function getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
}

// Validate email configuration
function validateEmailConfig(): void {
    if (!emailConfig.user || !emailConfig.pass || !emailConfig.to) {
        throw new Error('Email configuration missing: USER, PASS, or TO not set');
    }
}

// Send email with retry logic
async function sendEmailWithRetry(subject: string, html: string): Promise<void> {
    validateEmailConfig();

    const transporter = createTransporter();

    for (let attempt = 1; attempt <= TELEGRAM_CONFIG.RETRY_ATTEMPTS; attempt++) {
        try {
            await transporter.sendMail({
                from: emailConfig.from,
                to: emailConfig.to,
                subject,
                html
            });
            console.log(`📧 Email sent successfully (attempt ${attempt})`);
            return;
        } catch (err) {
            console.error(`❌ Email send attempt ${attempt} failed:`, err);
            if (attempt < TELEGRAM_CONFIG.RETRY_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, TELEGRAM_CONFIG.RETRY_DELAY_MS));
            } else {
                throw new Error(`Failed to send email after ${TELEGRAM_CONFIG.RETRY_ATTEMPTS} attempts`);
            }
        }
    }
}

export async function sendBullishStocksEmail(bullishResults: BullishStockResult[]): Promise<void> {
    if (!Array.isArray(bullishResults)) {
        throw new Error('Invalid input: bullish results must be an array');
    }

    if (bullishResults.length === 0) {
        const subject = '📊 No Bullish Signals Today';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">🔔 No Bullish Signals Today</h2>
                <p><strong>Date:</strong> ${getCurrentDate()}</p>
                <p><strong>Analysis:</strong> Nifty50 Analysis Complete</p>
                <p>No stocks currently meet the bullish criteria (rating ≥ 5/8).</p>
                <hr>
                <p style="color: #666; font-size: 12px;">${MESSAGES.DISCLAIMER}</p>
            </div>
        `;
        await sendEmailWithRetry(subject, html);
        return;
    }

    const today = getCurrentDate();
    const topStocks = bullishResults
        .sort((a, b) => b.rating - a.rating)
        .slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);

    let stocksHtml = '';
    topStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        stocksHtml += `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; background-color: #f9f9f9;">
                <h3 style="margin: 0 0 10px 0; color: #2e7d32;">
                    ${index + 1}. ${stock.symbol} (Rating: ${stock.rating}/8)
                </h3>
                <p><strong>📍 Signals:</strong> ${stock.signals.join(', ')}</p>
                <p><strong>🛡️ Stop Loss:</strong> ₹${stock.stopLoss.toFixed(2)} (${stock.stopLossPercent.toFixed(1)}%)</p>
                <p><strong>🎯 Target:</strong> ₹${stock.target.toFixed(2)} (+${stock.targetPercent.toFixed(1)}%)</p>
                <p><strong>📊 Risk/Reward:</strong> ${stock.riskRewardRatio.toFixed(1)}:1</p>
                <p><a href="${tvLink}" style="background-color: #1976d2; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">📈 View Chart</a></p>
            </div>
        `;
    });

    if (bullishResults.length > TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY) {
        stocksHtml += `<p>... and ${bullishResults.length - TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY} more bullish stocks</p>`;
    }

    const subject = `🚀 Bullish Stocks Alert - ${bullishResults.length} Signals`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1976d2; text-align: center;">🚀 Bullish Stocks Alert 🚀</h1>
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${today}</p>
                <p style="margin: 5px 0;"><strong>📊 Analysis:</strong> Nifty50 Stocks</p>
                <p style="margin: 5px 0;"><strong>📈 Found:</strong> ${bullishResults.length} Bullish Stock(s)</p>
                <p style="margin: 5px 0;"><em>Based on: Daily Close > 2 days ago Close</em></p>
            </div>

            ${stocksHtml}

            <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #f57c00;">🎯 Strategy Criteria:</h3>
                <ul>
                    <li>Price higher than 2 days ago</li>
                    <li>Price above EMA20/50</li>
                    <li>EMA20 > EMA50 structure</li>
                    <li>RSI 40-60 + MACD positive</li>
                    <li>Rating ≥ 5/8 points</li>
                </ul>
            </div>

            <hr>
            <p style="color: #666; font-size: 12px; text-align: center;">${MESSAGES.DISCLAIMER}</p>
        </div>
    `;

    await sendEmailWithRetry(subject, html);
    console.log(`📧 Email alert sent for ${bullishResults.length} bullish stocks`);
}

export async function sendEMA36Email(ema36Results: EMA36Result[]): Promise<void> {
    if (!Array.isArray(ema36Results)) {
        throw new Error('Invalid input: EMA36 results must be an array');
    }

    if (ema36Results.length === 0) {
        const subject = '📊 No EMA36 Signals Today';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">📉 No EMA36 Signals Today</h2>
                <p><strong>Date:</strong> ${getCurrentDate()}</p>
                <p><strong>Analysis:</strong> Nifty50 EMA36 Analysis Complete</p>
                <p>No stocks currently below or near the 36-period EMA.</p>
                <hr>
                <p style="color: #666; font-size: 12px;">${MESSAGES.DISCLAIMER}</p>
            </div>
        `;
        await sendEmailWithRetry(subject, html);
        return;
    }

    const today = getCurrentDate();
    const displayStocks = ema36Results.slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);

    let stocksHtml = '';
    displayStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        stocksHtml += `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; background-color: #f9f9f9;">
                <h3 style="margin: 0 0 10px 0; color: #1976d2;">
                    ${index + 1}. ${stock.symbol}
                </h3>
                <p><strong>💰 LTP:</strong> ₹${stock.ltp.toFixed(2)} | <strong>EMA36:</strong> ₹${stock.ema36.toFixed(2)}</p>
                <p><strong>📊 Diff:</strong> ${stock.percentDiff.toFixed(2)}%</p>
                <p><a href="${tvLink}" style="background-color: #1976d2; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">📈 View Chart</a></p>
            </div>
        `;
    });

    if (ema36Results.length > TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY) {
        stocksHtml += `<p>... and ${ema36Results.length - TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY} more stocks</p>`;
    }

    const subject = `📊 EMA36 Analysis Alert - ${ema36Results.length} Signals`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1976d2; text-align: center;">📊 EMA36 Analysis Alert 📊</h1>
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${today}</p>
                <p style="margin: 5px 0;"><strong>📈 Analysis:</strong> Nifty50 Stocks (36-week EMA on Weekly Candles)</p>
                <p style="margin: 5px 0;"><strong>📉 Found:</strong> ${ema36Results.length} Stock(s) Approaching EMA36 Breakout</p>
            </div>

            ${stocksHtml}

            <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #f57c00;">🎯 EMA36 Strategy:</h3>
                <ul>
                    <li>Stocks below 36-week EMA but within 2%</li>
                    <li>Approaching potential breakout from below</li>
                    <li>Weekly trend analysis for longer-term signals</li>
                </ul>
            </div>

            <hr>
            <p style="color: #666; font-size: 12px; text-align: center;">${MESSAGES.DISCLAIMER}</p>
        </div>
    `;

    await sendEmailWithRetry(subject, html);
    console.log(`📧 Email alert sent for ${ema36Results.length} EMA36 signals`);
}

export async function sendEMACrossoverEmail(emaCrossoverResults: EMACrossoverResult[]): Promise<void> {
    if (!Array.isArray(emaCrossoverResults)) {
        throw new Error('Invalid input: EMA crossover results must be an array');
    }

    if (emaCrossoverResults.length === 0) {
        const subject = '📊 No EMA Crossover Signals Today';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">📊 No EMA Crossover Signals Today</h2>
                <p><strong>Date:</strong> ${getCurrentDate()}</p>
                <p><strong>Analysis:</strong> Nifty50 EMA Crossover Analysis Complete</p>
                <p>No stocks currently showing EMA cascade crossovers (9-15-50).</p>
                <hr>
                <p style="color: #666; font-size: 12px;">${MESSAGES.DISCLAIMER}</p>
            </div>
        `;
        await sendEmailWithRetry(subject, html);
        return;
    }

    const today = getCurrentDate();
    const displayStocks = emaCrossoverResults.slice(0, TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY);

    let stocksHtml = '';
    displayStocks.forEach((stock, index) => {
        const tvLink = `https://in.tradingview.com/chart/?symbol=NSE%3A${stock.symbol}`;
        const emoji = stock.crossoverType === 'BULLISH' ? '🚀' : '📉';
        stocksHtml += `
            <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; background-color: #f9f9f9;">
                <h3 style="margin: 0 0 10px 0; color: ${stock.crossoverType === 'BULLISH' ? '#2e7d32' : '#d32f2f'};">
                    ${index + 1}. ${emoji} ${stock.symbol} (${stock.crossoverType})
                </h3>
                <p><strong>💰 LTP:</strong> ₹${stock.price.toFixed(2)}</p>
                <p><strong>📊 EMAs:</strong> 9=₹${stock.ema9.toFixed(2)} | 15=₹${stock.ema15.toFixed(2)} | 50=₹${stock.ema50.toFixed(2)}</p>
                <p><strong>📝 Signal:</strong> ${stock.signal}</p>
                <p><a href="${tvLink}" style="background-color: #1976d2; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block;">📈 View Chart</a></p>
            </div>
        `;
    });

    if (emaCrossoverResults.length > TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY) {
        stocksHtml += `<p>... and ${emaCrossoverResults.length - TELEGRAM_CONFIG.MAX_STOCKS_DISPLAY} more stocks</p>`;
    }

    const subject = `📊 EMA Crossover Alert - ${emaCrossoverResults.length} Signals`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1976d2; text-align: center;">📊 EMA Crossover Alert 📊</h1>
            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>📅 Date:</strong> ${today}</p>
                <p style="margin: 5px 0;"><strong>📈 Analysis:</strong> Nifty50 Stocks (EMA 9-15-50 Cascade Crossovers)</p>
                <p style="margin: 5px 0;"><strong>🔄 Found:</strong> ${emaCrossoverResults.length} EMA Crossover Signal(s)</p>
            </div>

            ${stocksHtml}

            <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #f57c00;">🎯 EMA Crossover Strategy:</h3>
                <ul>
                    <li>EMA9 crosses EMA15, and EMA15 crosses EMA50</li>
                    <li>Cascade crossover indicates strong trend momentum</li>
                    <li>Bullish: All EMAs align upward (9>15>50)</li>
                    <li>Bearish: All EMAs align downward (9<15<50)</li>
                </ul>
            </div>

            <hr>
            <p style="color: #666; font-size: 12px; text-align: center;">${MESSAGES.DISCLAIMER}</p>
        </div>
    `;

    await sendEmailWithRetry(subject, html);
    console.log(`📧 Email alert sent for ${emaCrossoverResults.length} EMA crossover signals`);
}
