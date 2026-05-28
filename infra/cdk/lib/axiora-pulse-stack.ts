import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export interface AxioraPulseStackProps extends cdk.StackProps {
  environment: 'dev' | 'qa' | 'prod' | 'development' | 'production';
  prodOverride?: boolean;
}

export class AxioraPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AxioraPulseStackProps) {
    super(scope, id, props);

    const envName = props.environment;
    const shortEnv = (envName === 'development' || envName === 'dev') ? 'dev' : 
                    (envName === 'production' || envName === 'prod') ? 'prod' : 'qa';

    // Safety Check: Prevent production deployment unless explicitly overridden
    if (shortEnv === 'prod' && !props.prodOverride && envName !== 'production') {
      throw new Error('Production deployment is disabled. Set prodOverride: true to enable.');
    }

    // Safety Check: Verify target account
    const expectedAccounts: { [key: string]: string } = {
      'dev': '079975324160',
      'qa': '681816818894',
      'prod': '217757579310',
    };

    if (expectedAccounts[shortEnv] && this.account !== expectedAccounts[shortEnv]) {
      throw new Error(`Account mismatch! Environment ${envName} expected account ${expectedAccounts[shortEnv]} but got ${this.account}.`);
    }

    // Log target information
    console.log(`\n🚀 Deploying AxioraPulse`);
    console.log(`📍 Environment: ${envName} (${shortEnv})`);
    console.log(`🆔 Account:     ${this.account}`);
    console.log(`🌍 Region:      ${this.region}`);
    console.log(`📦 Stack:       ${this.stackName}\n`);

    // 0. ECR Repositories (Only create if not PROD, assuming PROD already has them or is manual)
    let backendRepo: ecr.IRepository;
    let frontendRepo: ecr.IRepository;

    if (shortEnv === 'dev') {
      // Import existing dev-specific repositories to avoid 'already exists' error
      backendRepo = ecr.Repository.fromRepositoryName(this, 'BackendRepo', `axiora/pulse-fastapi-${envName}`);
      frontendRepo = ecr.Repository.fromRepositoryName(this, 'FrontendRepo', `axiora/pulse-frontend-${envName}`);
    } else if (shortEnv === 'qa') {
      backendRepo = new ecr.Repository(this, 'BackendRepo', {
        repositoryName: `axiora/pulse-fastapi-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
      });

      frontendRepo = new ecr.Repository(this, 'FrontendRepo', {
        repositoryName: `axiora/pulse-frontend-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
      });
    } else {
      backendRepo = ecr.Repository.fromRepositoryName(this, 'BackendRepo', 'axiora/pulse-fastapi');
      frontendRepo = ecr.Repository.fromRepositoryName(this, 'FrontendRepo', 'axiora/pulse-frontend');
    }

    // 1. Cognito User Pool and Client
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'AxioraPulseUserPool-' + envName,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: shortEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: 'AxioraPulseClient-' + envName,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // 2. AWS Systems Manager (SSM) Parameters for Cognito Setup
    new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_USER_POOL_ID`,
      stringValue: userPool.userPoolId,
      description: `Cognito User Pool ID for AxioraPulse (${envName})`,
    });

    new ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_APP_CLIENT_ID`,
      stringValue: userPoolClient.userPoolClientId,
      description: `Cognito User Pool Client ID for AxioraPulse (${envName})`,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
  }
}

