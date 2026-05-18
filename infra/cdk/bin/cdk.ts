#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AxioraPulseStack } from '../lib/axiora-pulse-stack';

const app = new cdk.App();

// Dev Environment (Account: 079975324160)
new AxioraPulseStack(app, 'AxioraPulseStackDev', {
  environment: 'dev',
  env: { 
    account: '079975324160', 
    region: 'ap-south-1' 
  },
  description: 'Development environment for AxioraPulse',
});

// Production Environment (Account: 217757579310)
new AxioraPulseStack(app, 'AxioraPulseStackProd', {
  environment: 'prod',
  env: { 
    account: '217757579310', 
    region: 'ap-south-1' 
  },
  description: 'Production environment for AxioraPulse',
});

// QA Environment (Placeholder for 3rd account)
// new AxioraPulseStack(app, 'AxioraPulseStackQa', {
//   environment: 'qa',
//   env: { account: 'THIRD_ACCOUNT_ID', region: 'ap-south-1' },
// });
