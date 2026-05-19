import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface AxioraPulseStackProps extends cdk.StackProps {
  environment: 'dev' | 'qa' | 'prod';
  prodOverride?: boolean;
}

export class AxioraPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AxioraPulseStackProps) {
    super(scope, id, props);

    const envName = props.environment;

    // Safety Check: Prevent production deployment unless explicitly overridden
    if (envName === 'prod' && !props.prodOverride) {
      throw new Error('Production deployment is disabled. Set prodOverride: true to enable.');
    }

    // Safety Check: Verify target account
    const expectedAccounts: { [key: string]: string } = {
      'dev': '079975324160',
      'prod': '217757579310',
    };

    if (expectedAccounts[envName] && this.account !== expectedAccounts[envName]) {
      throw new Error(`Account mismatch! Environment ${envName} expected account ${expectedAccounts[envName]} but got ${this.account}.`);
    }

    // Enable termination protection for PROD
    if (envName === 'prod') {
      // Note: terminationProtection can only be set on the Stack before it is instantiated or via CfnStack
      // But we can suggest it or try to set it via stack props in bin/cdk.ts
    }

    // Log target information
    console.log(`\n🚀 Deploying AxioraPulse`);
    console.log(`📍 Environment: ${envName}`);
    console.log(`🆔 Account:     ${this.account}`);
    console.log(`🌍 Region:      ${this.region}`);
    console.log(`📦 Stack:       ${this.stackName}\n`);

    // 1. VPC
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1, // To save costs in Dev/QA, we use 1 NAT gateway
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // 2. Security Groups
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      allowAllOutbound: true,
      description: `ALB Security Group for AxioraPulse ${envName}`,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));

    const backendSg = new ec2.SecurityGroup(this, 'BackendSg', {
      vpc,
      allowAllOutbound: true,
      description: `Backend Security Group for AxioraPulse ${envName}`,
    });
    backendSg.addIngressRule(albSg, ec2.Port.tcp(8000));

    const frontendSg = new ec2.SecurityGroup(this, 'FrontendSg', {
      vpc,
      allowAllOutbound: true,
      description: `Frontend Security Group for AxioraPulse ${envName}`,
    });
    frontendSg.addIngressRule(albSg, ec2.Port.tcp(80));

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      allowAllOutbound: true,
      description: `Database Security Group for AxioraPulse ${envName}`,
    });
    dbSg.addIngressRule(backendSg, ec2.Port.tcp(5432));

    // 3. RDS
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      securityGroups: [dbSg],
      databaseName: 'axiorapulse',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For Dev/QA
      deletionProtection: false,
    });

    // 4. Cognito
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `AxioraPulseUserPool-${envName}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: `AxioraPulseClient-${envName}`,
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userPassword: true,
        userSrp: true,
      },
    });

    // 5. ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `axiora-pulse-cluster-${envName}`,
      containerInsights: true,
    });

    // 6. ALBs
    const backendAlb = new elbv2.ApplicationLoadBalancer(this, 'BackendAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: `axiora-pulse-backend-alb-${envName}`,
    });

    const frontendAlb = new elbv2.ApplicationLoadBalancer(this, 'FrontendAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: `axiora-pulse-frontend-alb-${envName}`,
    });

    // 7. ECS Tasks and Services
    
    // IAM Roles
    const executionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'),
      ],
    });

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Backend
    const backendTaskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole,
      family: `pulse-backend-${envName}`,
    });

    const backendContainer = backendTaskDef.addContainer('BackendContainer', {
      image: ecs.ContainerImage.fromRegistry('217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi:latest'), // Placeholder
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'ecs', 
        logGroup: new logs.LogGroup(this, 'BackendLogGroup', {
          logGroupName: `/ecs/pulse-backend-${envName}`,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        })
      }),
      environment: {
        'ENVIRONMENT': envName,
        'COGNITO_REGION': this.region,
        'COGNITO_USER_POOL_ID': userPool.userPoolId,
        'COGNITO_APP_CLIENT_ID': userPoolClient.userPoolClientId,
      },
      secrets: {
        'DATABASE_URL': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DbUrlParam', { parameterName: `/axiorapulse/${envName}/DATABASE_URL`, version: 1 })),
        'SECRET_KEY': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'SecretKeyParam', { parameterName: `/axiorapulse/${envName}/SECRET_KEY`, version: 1 })),
        'ANTHROPIC_KEY': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'AnthropicKeyParam', { parameterName: `/axiorapulse/${envName}/ANTHROPIC_KEY`, version: 1 })),
        'EMAIL_FROM': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'EmailFromParam', { parameterName: `/axiorapulse/${envName}/EMAIL_FROM`, version: 1 })),
        'FRONTEND_URL': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'FrontendUrlParam', { parameterName: `/axiorapulse/${envName}/FRONTEND_URL`, version: 1 })),
        'RAZORPAY_KEY_ID': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'RazorpayKeyIdParam', { parameterName: `/axiorapulse/${envName}/RAZORPAY_KEY_ID`, version: 1 })),
        'RAZORPAY_KEY_SECRET': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'RazorpayKeySecretParam', { parameterName: `/axiorapulse/${envName}/RAZORPAY_KEY_SECRET`, version: 1 })),
      },
      healthCheck: {
        command: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/health')\" || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      }
    });

    backendContainer.addPortMappings({
      containerPort: 8000,
      protocol: ecs.Protocol.TCP,
    });

    const backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: 1,
      securityGroups: [backendSg],
      assignPublicIp: false,
      serviceName: `pulse-backend-service-${envName}`,
    });

    const backendListener = backendAlb.addListener('BackendListener', {
      port: 80, // Using 80 for simplicity in Dev/QA, can add HTTPS later
      open: true,
    });
    backendListener.addTargets('BackendTarget', {
      port: 8000,
      targets: [backendService],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
      },
    });

    // Frontend
    const frontendTaskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      family: `pulse-frontend-${envName}`,
    });

    const frontendContainer = frontendTaskDef.addContainer('FrontendContainer', {
      image: ecs.ContainerImage.fromRegistry('217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-frontend:latest'), // Placeholder
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'ecs', 
        logGroup: new logs.LogGroup(this, 'FrontendLogGroup', {
          logGroupName: `/ecs/pulse-frontend-${envName}`,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        })
      }),
      healthCheck: {
        command: ["CMD-SHELL", "wget -qO- http://localhost:80/ || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      }
    });

    frontendContainer.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    const frontendService = new ecs.FargateService(this, 'FrontendService', {
      cluster,
      taskDefinition: frontendTaskDef,
      desiredCount: 1,
      securityGroups: [frontendSg],
      assignPublicIp: false,
      serviceName: `pulse-frontend-service-${envName}`,
    });

    const frontendListener = frontendAlb.addListener('FrontendListener', {
      port: 80,
      open: true,
    });
    frontendListener.addTargets('FrontendTarget', {
      port: 80,
      targets: [frontendService],
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'DbEndpoint', { value: database.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'BackendAlbDns', { value: backendAlb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'FrontendAlbDns', { value: frontendAlb.loadBalancerDnsName });
  }
}
