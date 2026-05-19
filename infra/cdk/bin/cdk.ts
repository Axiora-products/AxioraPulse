#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AxioraPulseStack } from '../lib/axiora-pulse-stack';

const app = new cdk.App();

// Dev Environment
new AxioraPulseStack(app, 'AxioraPulseStackDev', {
  environment: 'dev',
  env: { 
    account: '079975324160', 
    region: 'ap-south-1' 
  },
  description: 'Development environment for AxioraPulse',
});

// QA Environment
new AxioraPulseStack(app, 'AxioraPulseStackQa', {
  environment: 'qa',
  env: { 
    account: process.env.CDK_QA_ACCOUNT || process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_QA_REGION || 'ap-south-1' 
  },
  description: 'QA environment for AxioraPulse',
});

// Production (Reference for future use or to compare)
// new AxioraPulseStack(app, 'AxioraPulseStackProd', {
//   environment: 'prod',
//   env: { account: '217757579310', region: 'ap-south-1' },
// });
