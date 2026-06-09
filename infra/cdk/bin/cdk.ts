#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { AxioraPulseStack } from '../lib/axiora-pulse-stack';
import { GitHubOidcStack } from '../lib/github-oidc-stack';

const app = new cdk.App();

// Add cdk-nag aspects conditionally
if (process.env.CDK_NAG_ENABLED === 'true') {
  Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
}

// Global / Shared Infrastructure

new GitHubOidcStack(app, 'AxioraPulseGitHubOidcStackProd', {
  env: { 
    account: '217757579310', 
    region: 'ap-south-1' 
  },
  repositoryConfig: [
    { owner: 'Kiran-axiora', repo: 'AxioraPulse' }
  ],
  description: 'GitHub Actions OIDC role for AxioraPulse PROD',
});

new GitHubOidcStack(app, 'AxioraPulseGitHubOidcStackQa', {
  env: { 
    account: '399894608507', 
    region: 'ap-south-1' 
  },
  repositoryConfig: [
    { owner: 'Kiran-axiora', repo: 'AxioraPulse' }
  ],
  description: 'GitHub Actions OIDC role for AxioraPulse QA',
});


// QA Environment
new AxioraPulseStack(app, 'AxioraPulseStackQa', {
  environment: 'qa',
  env: { 
    account: '399894608507', 
    region: 'ap-south-1' 
  },
  description: 'QA environment for AxioraPulse',
});


/*
// Production
new AxioraPulseStack(app, 'AxioraPulseStackProd', {
  environment: 'prod',
  prodOverride: process.env.CDK_PROD_ENABLED === 'true', 
  env: { 
    account: '217757579310', 
    region: 'ap-south-1' 
  },
  description: 'Production environment for AxioraPulse',
});
*/
