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
import * as ecr from 'aws-cdk-lib/aws-ecr';

export interface AxioraPulseStackProps extends cdk.StackProps {
  environment: 'development' | 'production';
}

export class AxioraPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AxioraPulseStackProps) {
    super(scope, id, props);

    const envName = props.environment;
    const shortEnv = envName === 'development' ? 'dev' : 'prod';

    const backendRepo = ecr.Repository.fromRepositoryName(this, 'BackendRepo', 'axiora/pulse-fastapi');
    const frontendRepo = ecr.Repository.fromRepositoryName(this, 'FrontendRepo', 'axiora/pulse-frontend');

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: envName === 'production' ? 2 : 1,
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

    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      allowAllOutbound: true,
      description: 'ALB Security Group for AxioraPulse ' + envName,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    const backendSg = new ec2.SecurityGroup(this, 'BackendSg', {
      vpc,
      allowAllOutbound: true,
      description: 'Backend Security Group for AxioraPulse ' + envName,
    });
    backendSg.addIngressRule(albSg, ec2.Port.tcp(8000));

    const frontendSg = new ec2.SecurityGroup(this, 'FrontendSg', {
      vpc,
      allowAllOutbound: true,
      description: 'Frontend Security Group for AxioraPulse ' + envName,
    });
    frontendSg.addIngressRule(albSg, ec2.Port.tcp(80));

    const dbSg = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      allowAllOutbound: true,
      description: 'Database Security Group for AxioraPulse ' + envName,
    });
    dbSg.addIngressRule(backendSg, ec2.Port.tcp(5432));

    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: envName === 'production' 
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      securityGroups: [dbSg],
      databaseName: 'axiorapulse',
      removalPolicy: envName === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: envName === 'production',
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'AxioraPulseUserPool-' + envName,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: envName === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: 'AxioraPulseClient-' + envName,
      authFlows: {
        userPassword: true,
        userSrp: true,
        refreshToken: true,
      },
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'axiora-pulse-cluster-' + envName,
      containerInsights: true,
    });

    const backendAlb = new elbv2.ApplicationLoadBalancer(this, 'BackendAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: 'pulse-back-alb-' + shortEnv,
    });

    const frontendAlb = new elbv2.ApplicationLoadBalancer(this, 'FrontendAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
      loadBalancerName: 'pulse-front-alb-' + shortEnv,
    });

    const executionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      roleName: 'ecsTaskExecutionRole-' + envName,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'),
      ],
    });

    backendRepo.grantPull(executionRole);
    frontendRepo.grantPull(executionRole);

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      roleName: 'ecsTaskRole-' + envName,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const backendTaskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole,
      taskRole,
      family: 'pulse-backend-' + envName,
    });

    const backendContainer = backendTaskDef.addContainer('BackendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(backendRepo, 'latest'),
      environment: {
        'ENVIRONMENT': envName,
        'COGNITO_REGION': this.region,
      },
      secrets: {
        'SECRET_KEY': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'SecretKeyParam', {
          parameterName: `/axiorapulse/${shortEnv}/SECRET_KEY`,
        })),
        'DATABASE_URL': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'DatabaseUrlParam', {
          parameterName: `/axiorapulse/${shortEnv}/DATABASE_URL`,
        })),
        'ANTHROPIC_KEY': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'AnthropicKeyParam', {
          parameterName: `/axiorapulse/${shortEnv}/ANTHROPIC_KEY`,
        })),
        'EMAIL_FROM': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'EmailFromParam', {
          parameterName: `/axiorapulse/${shortEnv}/EMAIL_FROM`,
        })),
        'FRONTEND_URL': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'FrontendUrlParam', {
          parameterName: `/axiorapulse/${shortEnv}/FRONTEND_URL`,
        })),
        'RAZORPAY_KEY_ID': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'RazorpayKeyIdParam', {
          parameterName: `/axiorapulse/${shortEnv}/RAZORPAY_KEY_ID`,
        })),
        'RAZORPAY_KEY_SECRET': ecs.Secret.fromSsmParameter(ssm.StringParameter.fromSecureStringParameterAttributes(this, 'RazorpayKeySecretParam', {
          parameterName: `/axiorapulse/${shortEnv}/RAZORPAY_KEY_SECRET`,
        })),
      },
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'ecs', 
        logGroup: new logs.LogGroup(this, 'BackendLogGroup', {
          logGroupName: '/ecs/pulse-backend-' + envName,
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        })
      }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:8000/health || python3 -c 'import urllib.request; urllib.request.urlopen(\"http://localhost:8000/health\")' || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      }
    });

    backendContainer.addPortMappings({ containerPort: 8000 });

    const backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: 1,
      securityGroups: [backendSg],
      assignPublicIp: false,
      serviceName: 'pulse-backend-service-' + envName,
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      circuitBreaker: { rollback: true },
    });

    const backendListener = backendAlb.addListener('BackendListener', { port: 80 });
    backendListener.addTargets('BackendTarget', {
      port: 8000,
      targets: [backendService],
      healthCheck: {
        path: '/health',
        interval: cdk.Duration.seconds(30),
      },
    });

    const frontendTaskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole,
      family: 'pulse-frontend-' + envName,
    });

    frontendTaskDef.addContainer('FrontendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(frontendRepo, 'latest'),
      logging: ecs.LogDrivers.awsLogs({ 
        streamPrefix: 'ecs', 
        logGroup: new logs.LogGroup(this, 'FrontendLogGroup', {
          logGroupName: '/ecs/pulse-frontend-' + envName,
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
    }).addPortMappings({ containerPort: 80 });

    const frontendService = new ecs.FargateService(this, 'FrontendService', {
      cluster,
      taskDefinition: frontendTaskDef,
      desiredCount: 1,
      securityGroups: [frontendSg],
      assignPublicIp: false,
      serviceName: 'pulse-frontend-service-' + envName,
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      circuitBreaker: { rollback: true },
    });

    const frontendListener = frontendAlb.addListener('FrontendListener', { port: 80 });
    frontendListener.addTargets('FrontendTarget', {
      port: 80,
      targets: [frontendService],
      healthCheck: {
        path: '/',
        interval: cdk.Duration.seconds(30),
      },
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'DbEndpoint', { value: database.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'BackendAlbDns', { value: backendAlb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'FrontendAlbDns', { value: frontendAlb.loadBalancerDnsName });
  }
}
