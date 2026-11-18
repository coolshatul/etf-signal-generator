import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dotenv from 'dotenv';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

dotenv.config();

export class EtfStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // 📦 Shared dependencies layer
        const sharedDepsLayer = new lambda.LayerVersion(this, 'SharedDepsLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layers/shared-deps')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
            description: 'Shared dependencies for Lambda functions',
        });

        // 🟡 Daily signal Lambda function
        const dailySignalLambda = new NodejsFunction(this, 'DailySignalLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../lambda/handlers/dailySignal.ts'),
            handler: 'handler',
            timeout: Duration.seconds(180),
            memorySize: 512,
            layers: [sharedDepsLayer],
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    'axios',
                    'chalk',
                    'groq-sdk',
                    'mongoose',
                    'nodemailer',
                    'rss-parser',
                    'technicalindicators',
                    'telegraf',
                    'vader-sentiment',
                    'yahoo-finance2'
                ],
            },
            environment: {
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? '',
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? '',
                MONGODB_URI: process.env.MONGODB_URI ?? '',
                EMAIL_SERVICE: process.env.EMAIL_SERVICE ?? '',
                EMAIL_USER: process.env.EMAIL_USER ?? '',
                EMAIL_PASS: process.env.EMAIL_PASS ?? '',
                EMAIL_FROM: process.env.EMAIL_FROM ?? '',
                EMAIL_TO: process.env.EMAIL_TO ?? '',
                TELEGRAM_TEST_MODE: 'false', // Always false in production
                EMAIL_ALERTS_ENABLED: process.env.EMAIL_ALERTS_ENABLED ?? 'true',
                TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED ?? 'false'
            },
        });

        // ⏰ One scan per day, after the session has closed and the daily
        // candle is final (16:00 IST = 10:30 UTC). The alert is a setup for
        // the next session's open, so a second pre-open run would compete for
        // the same dedupe slot with a stale candle.
        new events.Rule(this, 'DailySignalSchedule', {
            schedule: events.Schedule.cron({
                minute: '30',
                hour: '10',
                weekDay: 'MON-FRI',
            }),
            targets: [new targets.LambdaFunction(dailySignalLambda)],
        });

        // 🟠 EMA36 signal Lambda function
        const ema36SignalLambda = new NodejsFunction(this, 'EMA36SignalLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../lambda/handlers/dailySignalEMA36.ts'),
            handler: 'handler',
            timeout: Duration.seconds(180),
            memorySize: 512,
            layers: [sharedDepsLayer],
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    'axios',
                    'chalk',
                    'groq-sdk',
                    'mongoose',
                    'nodemailer',
                    'rss-parser',
                    'technicalindicators',
                    'telegraf',
                    'vader-sentiment',
                    'yahoo-finance2'
                ],
            },
            environment: {
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? '',
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? '',
                MONGODB_URI: process.env.MONGODB_URI ?? '',
                EMAIL_SERVICE: process.env.EMAIL_SERVICE ?? '',
                EMAIL_USER: process.env.EMAIL_USER ?? '',
                EMAIL_PASS: process.env.EMAIL_PASS ?? '',
                EMAIL_FROM: process.env.EMAIL_FROM ?? '',
                EMAIL_TO: process.env.EMAIL_TO ?? '',
                TELEGRAM_TEST_MODE: 'false', // Always false in production
                EMAIL_ALERTS_ENABLED: process.env.EMAIL_ALERTS_ENABLED ?? 'true',
                TELEGRAM_ALERTS_ENABLED: process.env.TELEGRAM_ALERTS_ENABLED ?? 'false'
            },
        });

        // ⏰ Weekly, after Friday's weekly candle is final.
        // Saturday 09:30 IST = 04:00 UTC.
        new events.Rule(this, 'EMA36SignalSchedule', {
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '4',
                weekDay: 'SAT',
            }),
            targets: [new targets.LambdaFunction(ema36SignalLambda)],
        });

        // 🟢 Performance update Lambda function
        const performanceUpdateLambda = new NodejsFunction(this, 'PerformanceUpdateLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../lambda/handlers/updatePerformance.ts'),
            handler: 'handler',
            // Batched, per-symbol fetches need more than the old 60s budget as
            // signals accumulate.
            timeout: Duration.seconds(300),
            memorySize: 512,
            layers: [sharedDepsLayer],
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    'axios',
                    'chalk',
                    'groq-sdk',
                    'mongoose',
                    'nodemailer',
                    'rss-parser',
                    'technicalindicators',
                    'telegraf',
                    'vader-sentiment',
                    'yahoo-finance2'
                ],
            },
            environment: {
                MONGODB_URI: process.env.MONGODB_URI ?? '',
            },
        });

        // ⏰ Schedule performance update at 4:30 PM IST (11:00 AM UTC)
        new events.Rule(this, 'PerformanceUpdateSchedule', {
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '11',
                weekDay: 'MON-FRI',
            }),
            targets: [new targets.LambdaFunction(performanceUpdateLambda)],
        });

        // 📈 Weekly performance email. Saturday 10:00 AM IST (4:30 AM UTC)
        // so it covers the full trading week including Friday's close.
        const weeklyPerformanceLambda = new NodejsFunction(this, 'WeeklyPerformanceLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../lambda/handlers/weeklyPerformance.ts'),
            handler: 'handler',
            timeout: Duration.seconds(120),
            memorySize: 256,
            layers: [sharedDepsLayer],
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    'axios',
                    'chalk',
                    'groq-sdk',
                    'mongoose',
                    'nodemailer',
                    'rss-parser',
                    'technicalindicators',
                    'telegraf',
                    'vader-sentiment',
                    'yahoo-finance2'
                ],
            },
            environment: {
                MONGODB_URI: process.env.MONGODB_URI ?? '',
                EMAIL_SERVICE: process.env.EMAIL_SERVICE ?? '',
                EMAIL_USER: process.env.EMAIL_USER ?? '',
                EMAIL_PASS: process.env.EMAIL_PASS ?? '',
                EMAIL_FROM: process.env.EMAIL_FROM ?? '',
                EMAIL_TO: process.env.EMAIL_TO ?? '',
                EMAIL_ALERTS_ENABLED: process.env.EMAIL_ALERTS_ENABLED ?? 'true'
            },
        });

        new events.Rule(this, 'WeeklyPerformanceSchedule', {
            schedule: events.Schedule.cron({
                minute: '30',
                hour: '4',
                weekDay: 'SAT',
            }),
            targets: [new targets.LambdaFunction(weeklyPerformanceLambda)],
        });

        // 🤖 Telegram Webhook Lambda
        const telegramWebhookLambda = new NodejsFunction(this, 'TelegramWebhookLambda', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: path.join(__dirname, '../../lambda/handlers/telegramWebhook.ts'),
            handler: 'handler',
            timeout: Duration.seconds(30),
            layers: [sharedDepsLayer],
            bundling: {
                minify: true,
                sourceMap: false,
                target: 'node22',
                externalModules: [
                    'axios',
                    'chalk',
                    'groq-sdk',
                    'mongoose',
                    'nodemailer',
                    'rss-parser',
                    'technicalindicators',
                    'telegraf',
                    'vader-sentiment',
                    'yahoo-finance2'
                ],
            },
            environment: {
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? '',
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? '',
                MONGODB_URI: process.env.MONGODB_URI ?? '',
                GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
                FUNDAMENTAL_API_KEY: process.env.FUNDAMENTAL_API_KEY ?? '',
                FUNDAMENTAL_API_BASE_URL: process.env.FUNDAMENTAL_API_BASE_URL ?? '',
            },
        });

        // 🌐 API Gateway to expose the webhook
        const api = new apigateway.RestApi(this, 'TelegramWebhookAPI', {
            restApiName: 'Telegram Webhook API',
            deployOptions: {
                stageName: 'prod',
            },
        });

        // /webhook POST endpoint
        api.root.addResource('webhook').addMethod(
            'POST',
            new apigateway.LambdaIntegration(telegramWebhookLambda)
        );
    }
}
