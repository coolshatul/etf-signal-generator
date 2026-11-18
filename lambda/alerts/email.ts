import * as nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';
import { BullishStockResult, EMA36Result } from '../types/index.js';
import type { PerformanceReport } from '../reports/performanceReport';
import { TELEGRAM_CONFIG, MESSAGES } from '../utils/common';
import { istDateKey } from '../utils/marketTime';

dotenv.config();

const emailConfig = {
    service: process.env.EMAIL_SERVICE || 'gmail',
    user: process.env.EMAIL_USER!,
    pass: process.env.EMAIL_PASS!,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER!,
    to: process.env.EMAIL_TO!
};

// Emails are the primary alert channel, so show more than the Telegram limit.
const MAX_EMAIL_SIGNALS = 25;

const FONT_STACK =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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
    return istDateKey(new Date());
}

function displayDate(): string {
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
    }).format(new Date());
}

function displayTime(): string {
    return new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    }).format(new Date());
}

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
    }).format(date);
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inr(value?: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `₹${value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function percent(value?: number | null, digits = 1): string {
    if (value == null || !Number.isFinite(value)) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(digits)}%`;
}

function riskPercent(entry?: number, stop?: number): number | null {
    if (!entry || !stop || !Number.isFinite(entry) || !Number.isFinite(stop)) {
        return null;
    }
    return (Math.abs(entry - stop) / entry) * 100;
}

function rewardPercent(entry?: number, target?: number): number | null {
    if (!entry || !target || !Number.isFinite(entry) || !Number.isFinite(target)) {
        return null;
    }
    return (Math.abs(target - entry) / entry) * 100;
}

function average(values: number[]): number | null {
    const finite = values.filter(value => Number.isFinite(value));
    if (!finite.length) return null;
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
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

type Tone = 'positive' | 'negative' | 'neutral' | 'watch';

const TONES: Record<Tone, { bg: string; color: string }> = {
    positive: { bg: '#dcfce7', color: '#166534' },
    negative: { bg: '#fee2e2', color: '#991b1b' },
    neutral: { bg: '#e0e7ff', color: '#3730a3' },
    watch: { bg: '#fef3c7', color: '#92400e' }
};

function pill(label: string, tone: Tone): string {
    const { bg, color } = TONES[tone];
    return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${bg};color:${color};font-size:11px;font-weight:700;letter-spacing:0.3px;white-space:nowrap;">${escapeHtml(
        label
    )}</span>`;
}

interface Stat {
    label: string;
    value: string;
    tone?: Tone;
}

function renderStats(stats: Stat[]): string {
    if (!stats.length) return '';
    const width = `${Math.floor(100 / stats.length)}%`;

    const cells = stats
        .map(stat => {
            const valueColor = stat.tone ? TONES[stat.tone].color : '#111827';
            return `
                <td width="${width}" style="padding:12px 10px;text-align:center;vertical-align:top;border-right:1px solid #eef0f3;">
                    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#6b7280;margin-bottom:4px;">${escapeHtml(
                        stat.label
                    )}</div>
                    <div style="font-size:18px;font-weight:700;color:${valueColor};line-height:1.2;">${escapeHtml(
                        stat.value
                    )}</div>
                </td>`;
        })
        .join('');

    return `
        <table role="presentation" width="100%" style="border-collapse:collapse;background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;margin:0 0 22px;">
            <tr>${cells}</tr>
        </table>`;
}

interface LevelCell {
    label: string;
    value: string;
    color?: string;
}

function renderLevels(levels: LevelCell[]): string {
    return levels
        .map(
            level => `
            <div style="font-size:12px;line-height:1.6;color:#6b7280;">
                ${escapeHtml(level.label)}
                <span style="float:right;font-weight:700;color:${level.color ?? '#111827'};">${escapeHtml(
                level.value
            )}</span>
            </div>`
        )
        .join('');
}

interface EmailShellOptions {
    title: string;
    accent: string;
    preheader: string;
    intro: string;
    stats: Stat[];
    table: string;
    explainerTitle: string;
    explainer: string[];
    footnote?: string;
}

function renderEmailShell(options: EmailShellOptions): string {
    const explainerItems = options.explainer
        .map(
            item =>
                `<li style="margin:0 0 8px 0;font-size:13px;line-height:1.55;color:#374151;">${escapeHtml(
                    item
                )}</li>`
        )
        .join('');

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(options.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;">${escapeHtml(
        options.preheader
    )}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
        <tr>
            <td align="center" style="padding:24px 12px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;font-family:${FONT_STACK};">
                    <tr>
                        <td style="background:${options.accent};padding:26px 28px 22px;">
                            <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:rgba(255,255,255,0.8);font-weight:700;">ETF Signal Generator</div>
                            <h1 style="margin:8px 0 6px 0;font-size:24px;line-height:1.25;color:#ffffff;font-weight:700;">${escapeHtml(
                                options.title
                            )}</h1>
                            <div style="font-size:13px;color:rgba(255,255,255,0.85);">${escapeHtml(
                                displayDate()
                            )} · ${escapeHtml(displayTime())} IST</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px 28px 4px;">
                            <p style="margin:0 0 18px 0;font-size:15px;line-height:1.6;color:#374151;">${escapeHtml(
                                options.intro
                            )}</p>
                            ${renderStats(options.stats)}
                            ${options.table}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:4px 28px 26px;">
                            <div style="background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:16px 18px;">
                                <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:8px;">${escapeHtml(
                                    options.explainerTitle
                                )}</div>
                                <ul style="margin:0;padding-left:18px;">${explainerItems}</ul>
                            </div>
                            ${
                                options.footnote
                                    ? `<p style="margin:14px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">${escapeHtml(
                                          options.footnote
                                      )}</p>`
                                    : ''
                            }
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:18px 28px 24px;border-top:1px solid #eef0f3;background:#fcfcfd;">
                            <p style="margin:0 0 6px 0;font-size:11px;line-height:1.6;color:#9ca3af;">
                                Generated automatically from completed NSE candles. Data source: Yahoo Finance. All times IST.
                            </p>
                            <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af;">${escapeHtml(
                                MESSAGES.DISCLAIMER
                            )}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function renderSignalTable(header: string[], rows: string[]): string {
    const head = header
        .map(
            cell =>
                `<th align="left" style="padding:10px 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;font-weight:700;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(
                    cell
                )}</th>`
        )
        .join('');

    return `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 22px;">
            <thead>
                <tr style="background:#f9fafb;">${head}</tr>
            </thead>
            <tbody>
                ${rows.join('')}
            </tbody>
        </table>`;
}

function renderRow(cells: string[]): string {
    const tds = cells
        .map(
            (cell, index) =>
                `<td style="padding:12px 8px;vertical-align:top;border-bottom:1px solid #eef0f3;${
                    index === cells.length - 1 ? 'text-align:right;' : ''
                }">${cell}</td>`
        )
        .join('');
    return `<tr>${tds}</tr>`;
}

function chartLink(symbol: string): string {
    const url = `https://in.tradingview.com/chart/?symbol=NSE%3A${encodeURIComponent(symbol)}`;
    return `<a href="${url}" style="color:#2563eb;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;">Chart →</a>`;
}

function symbolCell(symbol: string, detail: string): string {
    return `
        <div style="font-size:14px;font-weight:700;color:#111827;line-height:1.3;">${escapeHtml(symbol)}</div>
        <div style="font-size:11px;color:#6b7280;line-height:1.45;margin-top:2px;">${escapeHtml(detail)}</div>`;
}

export async function sendBullishStocksEmail(bullishResults: BullishStockResult[]): Promise<void> {
    if (!Array.isArray(bullishResults)) {
        throw new Error('Invalid input: bullish results must be an array');
    }

    if (bullishResults.length === 0) {
        const html = renderEmailShell({
            title: 'No Bullish Signals Today',
            accent: '#475569',
            preheader: 'No ETFs met the bullish criteria today.',
            intro:
                'The daily scan completed and found no executable bullish setups. Nothing needs your attention today.',
            stats: [{ label: 'Signals', value: '0' }],
            table: '',
            explainerTitle: 'What was checked',
            explainer: [
                'Price above EMA20 and EMA50 with a positive EMA structure.',
                'RSI and MACD momentum conditions.',
                'A valid stop below entry, a target above entry, at least 1.5:1 reward:risk, and a stop no wider than 12%.'
            ]
        });
        await sendEmailWithRetry(`NSE Swing Signals — no setups (${getCurrentDate()})`, html);
        return;
    }

    const sorted = [...bullishResults].sort((a, b) => b.rating - a.rating);
    const display = sorted.slice(0, MAX_EMAIL_SIGNALS);

    const rows = display.map(stock => {
        const risk = Math.abs(stock.stopLossPercent || 0);
        const reward = Math.abs(stock.targetPercent || 0);
        const detail = `Rating ${stock.rating}/10${
            stock.signals.length ? ` · ${stock.signals.slice(0, 2).join(' · ')}` : ''
        }${
            stock.maxEntry
                ? ` · enter at next open ≤ ${inr(stock.maxEntry)}`
                : ''
        }`;

        return renderRow([
            symbolCell(stock.symbol, detail),
            pill('BUY', 'positive'),
            renderLevels([
                { label: 'Entry', value: inr(stock.price) },
                { label: 'Stop', value: inr(stock.stopLoss), color: '#b91c1c' },
                { label: 'Target', value: inr(stock.target), color: '#15803d' }
            ]),
            `<div style="font-size:14px;font-weight:700;color:#111827;">${stock.riskRewardRatio.toFixed(
                1
            )} : 1</div>
             <div style="font-size:11px;color:#6b7280;line-height:1.45;">risk ${percent(
                 -risk
             )} · reward ${percent(reward)}</div>`,
            chartLink(stock.symbol)
        ]);
    });

    const averageRr = average(display.map(stock => stock.riskRewardRatio));
    const averageRisk = average(display.map(stock => Math.abs(stock.stopLossPercent || 0)));
    const regime = bullishResults[0]?.marketRegimeBullish;

    const html = renderEmailShell({
        title: `${bullishResults.length} ETF Setup${
            bullishResults.length === 1 ? '' : 's'
        } for the Next Session`,
        accent: '#166534',
        preheader: `${bullishResults.length} ETF${
            bullishResults.length === 1 ? ' is' : 's are'
        } set up. Enter at the next open only below the stated ceiling.`,
        intro: `The scan found ${bullishResults.length} ETF${
            bullishResults.length === 1 ? '' : 's'
        } with a valid bullish structure. The price shown is the completed close that triggered the setup. Enter at the next session's open, and only if that open is at or below the ceiling for the trade.`,
        stats: [
            { label: 'Signals', value: String(bullishResults.length) },
            { label: 'Avg R : R', value: averageRr ? `${averageRr.toFixed(1)} : 1` : '—' },
            { label: 'Avg Stop Risk', value: averageRisk ? percent(-averageRisk) : '—' },
            {
                label: 'Market Regime',
                value: regime == null ? '—' : regime ? 'Bullish' : 'Weak',
                tone: regime == null ? 'neutral' : regime ? 'positive' : 'negative'
            }
        ],
        table: renderSignalTable(
            ['ETF', 'Action', 'Entry / Stop / Target', 'Risk : Reward', ''],
            rows
        ),
        explainerTitle: 'How to use this email',
        explainer: [
            'The signal price is the last completed daily close. Your entry is the next session open, so the fill can differ from the price shown.',
            'The ceiling is the highest open that still keeps the stop within 12% and the reward at least equal to the risk. If the open is above it, skip the trade.',
            'Signals with less than 1.5:1 reward:risk at the signal close are rejected before they reach this email.',
            'These are research alerts, not buy orders. Size positions so a stop-out costs a fixed small percentage of your capital.',
            'Reported performance is net of ~0.35% round-trip costs plus slippage.'
        ],
        footnote:
            bullishResults.length > MAX_EMAIL_SIGNALS
                ? `Showing the top ${MAX_EMAIL_SIGNALS} of ${bullishResults.length} signals, ranked by rating.`
                : undefined
    });

    await sendEmailWithRetry(
        `NSE ETF Signals — ${bullishResults.length} BUY setup${
            bullishResults.length === 1 ? '' : 's'
        } (${getCurrentDate()})`,
        html
    );
    console.log(`📧 Email alert sent for ${bullishResults.length} bullish ETFs`);
}

export async function sendEMA36Email(ema36Results: EMA36Result[]): Promise<void> {
    if (!Array.isArray(ema36Results)) {
        throw new Error('Invalid input: EMA36 results must be an array');
    }

    if (ema36Results.length === 0) {
        const html = renderEmailShell({
            title: 'No Weekly Pullback Candidates',
            accent: '#475569',
            preheader: 'No ETFs are near the 36-week EMA this week.',
            intro:
                'The weekly watchlist scan completed. No stocks are currently within 2% below their 36-week EMA.',
            stats: [{ label: 'Candidates', value: '0' }],
            table: '',
            explainerTitle: 'What this scan looks for',
            explainer: [
                'ETFs trading below the 36-week EMA but within 2% of it.',
                'The list is a research watchlist, not a BUY signal.',
                'No entry, stop or target is implied.'
            ]
        });
        await sendEmailWithRetry(
            `Weekly Pullback Watchlist — no candidates (${getCurrentDate()})`,
            html
        );
        return;
    }

    const sorted = [...ema36Results].sort((a, b) => Math.abs(a.percentDiff) - Math.abs(b.percentDiff));
    const display = sorted.slice(0, MAX_EMAIL_SIGNALS);

    const rows = display.map(stock =>
        renderRow([
            symbolCell(stock.symbol, `LTP ${inr(stock.ltp)} · EMA36 ${inr(stock.ema36)}`),
            pill('WATCH', 'watch'),
            `<div style="font-size:12px;line-height:1.6;color:#92400e;font-weight:700;">No trade levels</div>
             <div style="font-size:11px;color:#6b7280;line-height:1.45;">Watch for a weekly reclaim of the EMA.</div>`,
            `<div style="font-size:14px;font-weight:700;color:#92400e;">${percent(
                stock.percentDiff
            )}</div>
             <div style="font-size:11px;color:#6b7280;line-height:1.45;">from the 36-week EMA</div>`,
            chartLink(stock.symbol)
        ])
    );

    const averageDistance = average(display.map(stock => Math.abs(stock.percentDiff)));
    const closest = display[0];

    const html = renderEmailShell({
        title: `${ema36Results.length} Weekly Pullback Candidate${
            ema36Results.length === 1 ? '' : 's'
        }`,
        accent: '#92400e',
        preheader: `${ema36Results.length} Nifty 50 stocks are sitting just below their 36-week EMA. Watchlist only.`,
        intro: `This is a watchlist, not a trade list. ${ema36Results.length} stock${
            ema36Results.length === 1 ? ' is' : 's are'
        } trading within 2% below the 36-week EMA, which is often where a longer-term pullback either stabilises or breaks down.`,
        stats: [
            { label: 'Candidates', value: String(ema36Results.length) },
            {
                label: 'Closest to EMA',
                value: closest ? `${closest.symbol} ${percent(closest.percentDiff)}` : '—'
            },
            { label: 'Avg Distance', value: averageDistance ? percent(-averageDistance) : '—' },
            { label: 'Timeframe', value: 'Weekly' }
        ],
        table: renderSignalTable(
            ['Stock', 'Status', 'Trade Plan', 'Distance', ''],
            rows
        ),
        explainerTitle: 'How to use the watchlist',
        explainer: [
            'These stocks are below the 36-week EMA but close enough to be worth monitoring.',
            'There is no entry, stop or target here. Wait for a confirmed weekly close back above the EMA, or a separate setup with defined risk.',
            'Watchlist entries are excluded from trade performance and win-rate statistics.',
            'A stock can stay on this list for several weeks; duplicates are suppressed per weekly candle.'
        ],
        footnote:
            ema36Results.length > MAX_EMAIL_SIGNALS
                ? `Showing the ${MAX_EMAIL_SIGNALS} closest of ${ema36Results.length} candidates.`
                : undefined
    });

    await sendEmailWithRetry(
        `Weekly Pullback Watchlist — ${ema36Results.length} candidate${
            ema36Results.length === 1 ? '' : 's'
        } (${getCurrentDate()})`,
        html
    );
    console.log(
        `📧 Email alert sent for ${ema36Results.length} weekly pullback candidates`
    );
}

const STRATEGY_LABELS: Record<string, string> = {
    ETF_BULLISH_SCAN: 'ETF bullish swing',
    BULLISH_SCAN: 'Bullish swing (stocks)',
    EMA_CROSSOVER_SCAN: 'EMA crossover',
    BULLISH_SCAN_ALERT: 'Legacy bullish',
    WEEKLY_PULLBACK_WATCHLIST: 'Weekly watchlist'
};

const EXIT_LABELS: Record<string, string> = {
    TARGET: 'Target hit',
    STOP: 'Stop hit',
    MAX_HOLDING: 'Max holding',
    REVERSAL: 'Reversal',
    DELISTED: 'Delisted',
    MIGRATION: 'Migration',
    MANUAL: 'Manual'
};

function strategyLabel(strategy: string): string {
    return STRATEGY_LABELS[strategy] ?? strategy;
}

function netCell(value: number | null): string {
    if (value == null || !Number.isFinite(value)) {
        return `<span style="color:#9ca3af;">—</span>`;
    }
    const color = value >= 0 ? '#15803d' : '#b91c1c';
    return `<span style="font-weight:700;color:${color};">${percent(value)}</span>`;
}

export async function sendPerformanceReportEmail(
    report: PerformanceReport
): Promise<void> {
    if (!report || typeof report !== 'object') {
        throw new Error('Invalid input: performance report is required');
    }

    const period = `${formatDate(report.from)} – ${formatDate(report.to)}`;

    const strategyRows = report.strategies.map(strategy =>
        renderRow([
            `<div style="font-size:13px;font-weight:700;color:#111827;">${escapeHtml(
                strategyLabel(strategy.strategy)
            )}</div>
             <div style="font-size:11px;color:#6b7280;">${escapeHtml(
                 strategy.timeframe
             )}</div>`,
            `<div style="font-size:13px;color:#111827;">${strategy.trades}</div>`,
            `<div style="font-size:13px;color:#111827;">${strategy.winRate == null ? '—' : `${strategy.winRate.toFixed(1)}%`}</div>`,
            netCell(strategy.avgNetPercent),
            `<div style="font-size:11px;line-height:1.5;color:#6b7280;">${
                strategy.best
                    ? `Best ${escapeHtml(strategy.best.symbol)} ${netCell(
                          strategy.best.netPercent
                      )}`
                    : '—'
            }<br>${
                strategy.worst
                    ? `Worst ${escapeHtml(strategy.worst.symbol)} ${netCell(
                          strategy.worst.netPercent
                      )}`
                    : ''
            }</div>`,
            `<div style="font-size:13px;color:#111827;">${strategy.open}</div>`
        ])
    );

    const recentRows = report.recent.map(trade =>
        renderRow([
            `<div style="font-size:12px;color:#374151;">${
                trade.exitDate ? formatDate(trade.exitDate) : '—'
            }</div>`,
            symbolCell(trade.symbol, `${strategyLabel(trade.strategy)} · ${trade.timeframe}`),
            `<div style="font-size:12px;color:#374151;">${escapeHtml(
                EXIT_LABELS[trade.exitReason ?? ''] ?? trade.exitReason ?? '—'
            )}</div>`,
            `<div style="font-size:12px;color:#6b7280;">${
                trade.holdingDays == null ? '—' : `${trade.holdingDays}d`
            }</div>`,
            netCell(trade.netPercent)
        ])
    );

    const intro =
        report.totalClosed > 0
            ? `${report.totalClosed} position${
                  report.totalClosed === 1 ? '' : 's'
              } closed in the last ${report.periodDays} days. ${
                  report.wins
              } finished green and ${report.losses} finished red after costs.`
            : `No positions closed in the last ${report.periodDays} days. There are currently ${report.totalOpen} open position${
                  report.totalOpen === 1 ? '' : 's'
              }.`;

    const html = renderEmailShell({
        title: 'Weekly Performance Report',
        accent: '#0f766e',
        preheader: `${report.totalClosed} closed trades, ${
            report.winRate == null ? 'no' : `${report.winRate.toFixed(1)}%`
        } win rate.`,
        intro,
        stats: [
            { label: 'Closed', value: String(report.totalClosed) },
            {
                label: 'Win Rate',
                value: report.winRate == null ? '—' : `${report.winRate.toFixed(1)}%`,
                tone:
                    report.winRate == null
                        ? 'neutral'
                        : report.winRate >= 50
                          ? 'positive'
                          : 'negative'
            },
            { label: 'Avg Net', value: report.avgNetPercent == null ? '—' : percent(report.avgNetPercent) },
            { label: 'Open', value: String(report.totalOpen) }
        ],
        table:
            (strategyRows.length
                ? renderSignalTable(
                      ['Strategy', 'Trades', 'Win Rate', 'Avg Net', 'Best / Worst', 'Open'],
                      strategyRows
                  )
                : '') +
            (recentRows.length
                ? `<div style="font-size:13px;font-weight:700;color:#111827;margin:6px 0 8px;">Recent closed trades</div>` +
                  renderSignalTable(
                      ['Date', 'Stock', 'Exit', 'Held', 'Net'],
                      recentRows
                  )
                : ''),
        explainerTitle: 'How to read this report',
        explainer: [
            'Net performance includes the 0.35% round-trip delivery cost plus 5 bps slippage per side.',
            'A win is any closed trade with a positive net return. Stops and max-holding exits are counted by their realised result.',
            'Open positions are marked to the latest completed candle and are not counted as wins or losses yet.',
            'Watchlist entries are not trades and are excluded from these statistics.'
        ],
        footnote: `Reporting period: ${period}. ${report.totalOpen} position${
            report.totalOpen === 1 ? '' : 's'
        } still open.`
    });

    await sendEmailWithRetry(
        `Weekly Performance — ${report.totalClosed} trade${
            report.totalClosed === 1 ? '' : 's'
        }, ${
            report.winRate == null ? 'no' : `${report.winRate.toFixed(1)}%`
        } win rate (${getCurrentDate()})`,
        html
    );
    console.log(
        `📧 Weekly performance email sent (${report.totalClosed} closed, ${report.totalOpen} open)`
    );
}
