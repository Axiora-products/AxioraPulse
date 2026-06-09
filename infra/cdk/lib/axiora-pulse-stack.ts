import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
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

    // 0.1 DNS and SSL Certificate
    const rootDomain = 'axiorapulse.com';
    const domainName = shortEnv === 'prod' ? rootDomain : `${shortEnv}.${rootDomain}`;

    // Lookup the existing parent hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'axiorapulse.com',
    });

    // Request a wildcard SSL certificate for the domain (e.g. *.qa.axiorapulse.com or *.axiorapulse.com)
    // validated automatically via DNS using the hosted zone
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainName,
      subjectAlternativeNames: [`*.${domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // RDS Database Security Group
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Security group for RDS PostgreSQL',
      allowAllOutbound: true,
    });

    // Database credentials secret (generates username & password in Secrets Manager)
    const dbSecret = new rds.DatabaseSecret(this, 'DbSecret', {
      username: 'postgres',
      secretName: `/axiorapulse/${shortEnv}/db-credentials`,
    });

    // RDS PostgreSQL database instance
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_13,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      databaseName: 'nexpulse',
      credentials: rds.Credentials.fromSecret(dbSecret),
      removalPolicy: shortEnv === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Store DB connection details in SSM (non-sensitive fields)
    const dbHostParam = new ssm.StringParameter(this, 'DbHostParam', {
      parameterName: `/axiorapulse/${shortEnv}/DB_HOST`,
      stringValue: database.dbInstanceEndpointAddress,
    });

    const dbPortParam = new ssm.StringParameter(this, 'DbPortParam', {
      parameterName: `/axiorapulse/${shortEnv}/DB_PORT`,
      stringValue: database.dbInstanceEndpointPort.toString(),
    });

    const dbNameParam = new ssm.StringParameter(this, 'DbNameParam', {
      parameterName: `/axiorapulse/${shortEnv}/DB_NAME`,
      stringValue: 'nexpulse',
    });

    const dbSecretArnParam = new ssm.StringParameter(this, 'DbSecretArnParam', {
      parameterName: `/axiorapulse/${shortEnv}/DB_SECRET_ARN`,
      stringValue: dbSecret.secretArn,
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
      },
      {
        id: 'AwsSolutions-COG1',
        reason: 'QA/Dev Cognito user pool does not require custom complex password policies.'
      },
      {
        id: 'AwsSolutions-COG2',
        reason: 'QA/Dev Cognito user pool does not require MFA to simplify developer access.'
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

    // Grant permission to read SSM parameters and Secrets Manager secrets
    taskExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssm:GetParameters',
        'ssm:GetParameter',
        'secretsmanager:GetSecretValue',
      ],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter/axiorapulse/${shortEnv}/*`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter/axiorapulse/*`,
        dbSecret.secretArn,
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

    database.connections.allowFrom(backendService, ec2.Port.tcp(5432), 'Allow backend to access database');

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
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      open: true,
    });

    frontendListener.addTargets('FrontendTarget', {
      port: 80,
      targets: [frontendService],
      healthCheck: {
        path: '/',
      }
    });

    // HTTP (80) to HTTPS (443) redirect
    const redirectListener = alb.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });
    redirectListener.node.addDependency(frontendListener);

    const backendListener = alb.addListener('BackendListener', {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [elbv2.ListenerCertificate.fromCertificateManager(certificate)],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      open: true,
    });

    backendListener.addTargets('BackendTarget', {
      port: 8000,
      targets: [backendService],
      healthCheck: {
        path: '/health',
      }
    });

    // 4.1 Route 53 DNS Records
    // Alias for frontend (e.g. qa.axiorapulse.com or axiorapulse.com)
    new route53.ARecord(this, 'FrontendAliasRecord', {
      zone: hostedZone,
      recordName: shortEnv === 'prod' ? undefined : shortEnv,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
    });

    // Alias for backend API (e.g. api.qa.axiorapulse.com or api.axiorapulse.com)
    new route53.ARecord(this, 'BackendAliasRecord', {
      zone: hostedZone,
      recordName: shortEnv === 'prod' ? 'api' : `api.${shortEnv}`,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(alb)),
    });

    // Allow frontend to communicate with backend internally
    backendService.connections.allowFrom(frontendService, ec2.Port.tcp(8000), 'Allow internal frontend to backend traffic');

    // 5. SSM Parameters
    const userPoolIdParam = new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_USER_POOL_ID`,
      stringValue: userPool.userPoolId,
    });

    const userPoolClientIdParam = new ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_APP_CLIENT_ID`,
      stringValue: userPoolClient.userPoolClientId,
    });

    const ecsClusterNameParam = new ssm.StringParameter(this, 'EcsClusterNameParam', {
      parameterName: `/axiorapulse/${shortEnv}/ECS_CLUSTER_NAME`,
      stringValue: cluster.clusterName,
    });

    const frontendUrlParam = new ssm.StringParameter(this, 'FrontendUrlParam', {
      parameterName: `/axiorapulse/${shortEnv}/FRONTEND_URL`,
      stringValue: `https://${domainName}`,
    });

    backendService.node.addDependency(dbHostParam);
    backendService.node.addDependency(dbPortParam);
    backendService.node.addDependency(dbNameParam);
    backendService.node.addDependency(dbSecretArnParam);
    backendService.node.addDependency(userPoolIdParam);
    backendService.node.addDependency(userPoolClientIdParam);
    backendService.node.addDependency(ecsClusterNameParam);
    backendService.node.addDependency(frontendUrlParam);

    frontendService.node.addDependency(userPoolIdParam);
    frontendService.node.addDependency(userPoolClientIdParam);
    frontendService.node.addDependency(ecsClusterNameParam);
    frontendService.node.addDependency(frontendUrlParam);

    // CDK-Nag Suppressions
    NagSuppressions.addResourceSuppressions(alb, [
      {
        id: 'AwsSolutions-ELB2',
        reason: 'QA/Dev Application Load Balancer does not require access logging to manage costs and complexity.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(alb.connections.securityGroups[0], [
      {
        id: 'AwsSolutions-EC23',
        reason: 'ALB is public-facing and must allow inbound HTTP/HTTPS traffic on ports 80, 443, and 8000.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(vpc, [
      {
        id: 'AwsSolutions-VPC7',
        reason: 'VPC Flow Logs are not enabled to reduce costs in QA and development environments.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(dbSecret, [
      {
        id: 'AwsSolutions-SMG4',
        reason: 'QA/Dev database secret rotation is managed manually or not required.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(database, [
      {
        id: 'AwsSolutions-RDS2',
        reason: 'QA database does not require storage encryption to reduce costs/complexity.'
      },
      {
        id: 'AwsSolutions-RDS3',
        reason: 'QA database is single-AZ to minimize costs.'
      },
      {
        id: 'AwsSolutions-RDS10',
        reason: 'QA database deletion protection is disabled to allow easy teardown.'
      },
      {
        id: 'AwsSolutions-RDS11',
        reason: 'QA database uses the default PostgreSQL port for simple local development/debugging connections.'
      }
    ]);

    NagSuppressions.addResourceSuppressions(taskExecutionRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'ECS Task Execution role requires the AWS managed AmazonECSTaskExecutionRolePolicy.'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'ECS Task Execution role needs wildcard permissions to read SSM parameters in its namespace.'
      }
    ], true);

    NagSuppressions.addResourceSuppressions(taskRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'ECS Task role requires AmazonSSMReadOnlyAccess to read parameters from SSM.'
      }
    ], true);

    NagSuppressions.addResourceSuppressions(backendTaskDef, [
      {
        id: 'AwsSolutions-ECS2',
        reason: 'Backend environment variables only contain non-sensitive configuration values.'
      }
    ]);



    // Outputs
    new cdk.CfnOutput(this, 'BackendServiceName', { value: backendService.serviceName });
    new cdk.CfnOutput(this, 'FrontendServiceName', { value: frontendService.serviceName });
    new cdk.CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: alb.loadBalancerDnsName });
  }
}

