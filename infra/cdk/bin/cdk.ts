#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AxioraPulseStack } from '../lib/axiora-pulse-stack';

const app = new cdk.App();

// Development Environment (Account: 079975324160)
new AxioraPulseStack(app, 'AxioraPulseStackDevelopment', {
  environment: 'development',
  env: { 
    account: '079975324160', 
    region: 'ap-south-1' 
  },
  description: 'Development environment for AxioraPulse',
});

// Production Environment (Account: 217757579310)
new AxioraPulseStack(app, 'AxioraPulseStackProduction', {
  environment: 'production',
  env: { 
    account: '217757579310', 
    region: 'ap-south-1' 
  },
  description: 'Production environment for AxioraPulse',
});
