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

        // 🟡 Daily signal Lambda function
        const dailySignalLambda = new NodejsFunction(this, 'DailySignalLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, '../../lambda/handlers/dailySignal.ts'),
            handler: 'handler',
            timeout: Duration.seconds(30),
            environment: {
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? '',
                TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? ''
            },
        });

        // ⏰ Schedule the Lambda to run at 9:00 AM IST (UTC+5:30 = 3:30 AM UTC)
        new events.Rule(this, 'DailySignalSchedule', {
            schedule: events.Schedule.cron({
                minute: '30',
                hour: '3',
                weekDay: 'MON-FRI', // Weekdays only
            }),
            targets: [new targets.LambdaFunction(dailySignalLambda)],
        });

        // 🤖 Telegram Webhook Lambda
        const telegramWebhookLambda = new NodejsFunction(this, 'TelegramWebhookLambda', {
            runtime: lambda.Runtime.NODEJS_20_X,
            entry: path.join(__dirname, '../../lambda/handlers/telegramWebhook.ts'),
            handler: 'handler',
            timeout: Duration.seconds(10),
            environment: {
                TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN ?? '',
                GROQ_API_KEY: process.env.GROQ_API_KEY ?? '',
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
