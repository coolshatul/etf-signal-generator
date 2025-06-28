import nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { StrategyResult } from '../types';

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT!),
    secure: false,
    auth: {
        user: process.env.SMTP_USER!,
        pass: process.env.SMTP_PASS!,
    },
});

export async function sendEmailAlert(result: StrategyResult): Promise<void> {
    const { symbol, signal, price, rsi, emaFast, emaSlow, date } = result;

    const html = `
    <h2>ETF Signal Alert</h2>
    <p><strong>Symbol:</strong> ${symbol}</p>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Signal:</strong> ${signal}</p>
    <p><strong>Price:</strong> ₹${price.toFixed(2)}</p>
    <p><strong>RSI:</strong> ${rsi.toFixed(2)}</p>
    <p><strong>EMA(9):</strong> ${emaFast.toFixed(2)}</p>
    <p><strong>EMA(21):</strong> ${emaSlow.toFixed(2)}</p>
    <p><em>${result.reason}</em></p>
  `;

    await transporter.sendMail({
        from: process.env.EMAIL_FROM!,
        to: process.env.EMAIL_TO!,
        subject: `ETF Signal: ${symbol} → ${signal}`,
        html,
    });

    console.log(`📧 Email alert sent for ${symbol}`);
}
