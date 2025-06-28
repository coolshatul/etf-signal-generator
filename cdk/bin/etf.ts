#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EtfStack } from '../lib/etf-stack';

const app = new cdk.App();

new EtfStack(app, 'EtfSignalStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'ap-south-1', // Mumbai region
    },
});
