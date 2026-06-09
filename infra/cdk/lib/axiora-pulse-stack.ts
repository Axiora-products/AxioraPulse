import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudmap from 'aws-cdk-lib/aws-servicediscovery';
import { NagSuppressions } from 'cdk-nag';

export interface AxioraPulseStackProps extends cdk.StackProps {
  environment: 'dev' | 'qa' | 'prod' | 'development' | 'production';
  prodOverride?: boolean;
}

export class AxioraPulseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AxioraPulseStackProps) {
    super(scope, id, props);

    const envName = props.environment;
    const shortEnv = (envName === 'production' || envName === 'prod') ? 'prod' : 
                    (envName === 'development' || envName === 'dev') ? 'dev' : 'qa';

    // Safety Check: Prevent production deployment unless explicitly overridden
    if (shortEnv === 'prod' && !props.prodOverride) {
      throw new Error('Production deployment is disabled. Set prodOverride: true to enable.');
    }

    // Safety Check: Verify target account
    const expectedAccounts: { [key: string]: string } = {
      'dev': '079975324160',
      'qa': '399894608507',
      'prod': '217757579310',
    };

    if (expectedAccounts[shortEnv] && this.account !== expectedAccounts[shortEnv]) {
      throw new Error(`Account mismatch! Environment ${envName} expected account ${expectedAccounts[shortEnv]} but got ${this.account}.`);
    }

    // 0. Infrastructure: VPC and Cluster
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `axiorapulse-${shortEnv}-cluster`,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: `${shortEnv}.local`,
        type: cloudmap.NamespaceType.DNS_PRIVATE,
      }
    });

    // 1. ECR Repositories
    let backendRepo: ecr.IRepository;
    let frontendRepo: ecr.IRepository;

    if (shortEnv === 'dev') {
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

      // Allow Production account to pull from QA repository for promotion
      const prodAccount = '217757579310';
      [backendRepo, frontendRepo].forEach(repo => {
        repo.addToResourcePolicy(new iam.PolicyStatement({
          sid: 'AllowProdPull',
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountPrincipal(prodAccount)],
          actions: [
            'ecr:BatchCheckLayerAvailability',
            'ecr:GetDownloadUrlForLayer',
            'ecr:BatchGetImage',
          ],
        }));
      });
    } else {
      backendRepo = ecr.Repository.fromRepositoryName(this, 'BackendRepo', 'axiora/pulse-fastapi');
      frontendRepo = ecr.Repository.fromRepositoryName(this, 'FrontendRepo', 'axiora/pulse-frontend');
    }

    // 2. Cognito User Pool and Client
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'AxioraPulseUserPool-' + envName,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: shortEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    NagSuppressions.addResourceSuppressions(userPool, [
      {
        id: 'AwsSolutions-COG8',
        reason: 'QA/Dev Cognito user pool does not require advanced security features (plus tier) to manage costs.'
      }
    ]);

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: 'AxioraPulseClient-' + envName,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    // 3. ECS Task Definitions and Services
    
    // IAM Role for ECS Tasks (Matches permissions in GitHubActionsDeployerRole but scoped to tasks)
    const taskExecutionRole = new iam.Role(this, 'EcsTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    backendRepo.grantPull(taskExecutionRole);
    frontendRepo.grantPull(taskExecutionRole);

    // Grant permission to read SSM parameters for secrets
    taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameters',
        'ssm:GetParameter',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/axiorapulse/${shortEnv}/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/axiorapulse/*`,
      ],
    }));

    const taskRole = new iam.Role(this, 'EcsTaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'));

    // Backend Fargate Service
    const backendTaskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      family: `pulse-backend-${shortEnv}`,
    });

    backendTaskDef.addContainer('BackendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(backendRepo, 'latest'), // Placeholder, GHA will update
      portMappings: [{ containerPort: 8000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'BackendLogGroup', {
        logGroupName: `/ecs/pulse-backend-${shortEnv}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }) }),
      healthCheck: {
        command: [
          "CMD-SHELL",
          "curl -f http://localhost:8000/health || exit 1"
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      environment: {
        'ENVIRONMENT': shortEnv,
        'COGNITO_REGION': this.region,
        'AWS_SES_REGION': this.region,
      }
    });

    const backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: 1,
      serviceName: `pulse-backend-${shortEnv}`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      cloudMapOptions: {
        name: 'backend',
      },
    });

    // Frontend Fargate Service
    const frontendTaskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      family: `pulse-frontend-${shortEnv}`,
    });

    frontendTaskDef.addContainer('FrontendContainer', {
      image: ecs.ContainerImage.fromEcrRepository(frontendRepo, 'latest'), // Placeholder, GHA will update
      portMappings: [{ containerPort: 80 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'FrontendLogGroup', {
        logGroupName: `/ecs/pulse-frontend-${shortEnv}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }) }),
      healthCheck: {
        command: [
          "CMD-SHELL",
          "wget -qO- http://localhost:80/ || exit 1"
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(10),
      }
    });

    const frontendService = new ecs.FargateService(this, 'FrontendService', {
      cluster,
      taskDefinition: frontendTaskDef,
      desiredCount: 1,
      serviceName: `pulse-frontend-${shortEnv}`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
    });

    // 4. Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: `axiorapulse-${shortEnv}-alb`,
    });

    const frontendListener = alb.addListener('FrontendListener', {
      port: 80,
      open: true,
    });

    frontendListener.addTargets('FrontendTarget', {
      port: 80,
      targets: [frontendService],
      healthCheck: {
        path: '/',
      }
    });

    const backendListener = alb.addListener('BackendListener', {
      port: 8000,
      open: true,
    });

    backendListener.addTargets('BackendTarget', {
      port: 8000,
      targets: [backendService],
      healthCheck: {
        path: '/health',
      }
    });

    // Allow frontend to communicate with backend internally
    backendService.connections.allowFrom(frontendService, ec2.Port.tcp(8000), 'Allow internal frontend to backend traffic');

    // 5. SSM Parameters
    new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_USER_POOL_ID`,
      stringValue: userPool.userPoolId,
    });

    new ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_APP_CLIENT_ID`,
      stringValue: userPoolClient.userPoolClientId,
    });

    new ssm.StringParameter(this, 'EcsClusterNameParam', {
      parameterName: `/axiorapulse/${shortEnv}/ECS_CLUSTER_NAME`,
      stringValue: cluster.clusterName,
    });

    // Outputs
    new cdk.CfnOutput(this, 'BackendServiceName', { value: backendService.serviceName });
    new cdk.CfnOutput(this, 'FrontendServiceName', { value: frontendService.serviceName });
    new cdk.CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: alb.loadBalancerDnsName });
  }
}

