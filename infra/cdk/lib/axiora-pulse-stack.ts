import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as cr from 'aws-cdk-lib/custom-resources';

import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as cloudmap from 'aws-cdk-lib/aws-servicediscovery';
import { NagSuppressions } from 'cdk-nag';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53_targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';

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

    const isProd = (shortEnv === 'prod');

    // Safety Check: Prevent production deployment unless explicitly overridden
    if (shortEnv === 'prod' && !props.prodOverride) {
      throw new Error('Production deployment is disabled. Set prodOverride: true to enable.');
    }

    // Safety Check: Verify target account
    const expectedAccounts: { [key: string]: string } = {
      'dev': '079975324160',
      'qa': '399894608507',
      'prod': '683354427635',
    };

    if (expectedAccounts[shortEnv] && this.account !== expectedAccounts[shortEnv]) {
      throw new Error(`Account mismatch! Environment ${envName} expected account ${expectedAccounts[shortEnv]} but got ${this.account}.`);
    }

    // 0. Infrastructure: VPC and Cluster
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: isProd ? undefined : 1, // Minimize NAT Gateway costs in Dev/QA
    });

    if (isProd) {
      vpc.addFlowLog('VpcFlowLog');
    }

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `axiorapulse-${shortEnv}-cluster`,
      containerInsights: true,
      defaultCloudMapNamespace: {
        name: `${shortEnv}.local`,
        type: cloudmap.NamespaceType.DNS_PRIVATE,
      }
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
      instanceType: isProd
        ? ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MEDIUM)
        : ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      databaseName: 'axiorapulse',
      credentials: rds.Credentials.fromSecret(dbSecret),
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      multiAz: isProd,
      storageEncrypted: isProd,
      backupRetention: isProd ? cdk.Duration.days(7) : undefined,
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
      stringValue: 'axiorapulse',
    });

    const dbSecretArnParam = new ssm.StringParameter(this, 'DbSecretArnParam', {
      parameterName: `/axiorapulse/${shortEnv}/DB_SECRET_ARN`,
      stringValue: dbSecret.secretArn,
    });

    // 1. ECR Repositories
    let backendRepo: ecr.IRepository;
    let frontendRepo: ecr.IRepository;
    let superadminBackendRepo: ecr.IRepository;
    let superadminFrontendRepo: ecr.IRepository;

    if (shortEnv === 'dev') {
      backendRepo = ecr.Repository.fromRepositoryName(this, 'BackendRepo', `axiora/pulse-fastapi-${envName}`);
      frontendRepo = ecr.Repository.fromRepositoryName(this, 'FrontendRepo', `axiora/pulse-frontend-${envName}`);
      superadminBackendRepo = ecr.Repository.fromRepositoryName(this, 'SuperadminBackendRepo', `axiora/pulse-superadmin-backend-${envName}`);
      superadminFrontendRepo = ecr.Repository.fromRepositoryName(this, 'SuperadminFrontendRepo', `axiora/pulse-superadmin-frontend-${envName}`);
    } else if (shortEnv === 'qa') {
      const qaLifecycleRules = [
        {
          rulePriority: 1,
          description: 'Keep images tagged with qa or latest',
          tagStatus: ecr.TagStatus.TAGGED,
          tagPrefixList: ['qa', 'latest'],
          maxImageCount: 999,
        },
        {
          rulePriority: 2,
          description: 'Retain only the last 5 images to optimize storage costs',
          tagStatus: ecr.TagStatus.ANY,
          maxImageCount: 5,
        }
      ];

      backendRepo = new ecr.Repository(this, 'BackendRepo', {
        repositoryName: `axiora/pulse-fastapi-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
        lifecycleRules: qaLifecycleRules,
      });

      frontendRepo = new ecr.Repository(this, 'FrontendRepo', {
        repositoryName: `axiora/pulse-frontend-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
        lifecycleRules: qaLifecycleRules,
      });

      superadminBackendRepo = new ecr.Repository(this, 'SuperadminBackendRepo', {
        repositoryName: `axiora/pulse-superadmin-backend-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
        lifecycleRules: qaLifecycleRules,
      });

      superadminFrontendRepo = new ecr.Repository(this, 'SuperadminFrontendRepo', {
        repositoryName: `axiora/pulse-superadmin-frontend-${envName}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true,
        lifecycleRules: qaLifecycleRules,
      });

      // Allow Production account to pull from QA repository for promotion
      const prodAccount = '683354427635';
      [backendRepo, frontendRepo, superadminBackendRepo, superadminFrontendRepo].forEach(repo => {
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
      superadminBackendRepo = ecr.Repository.fromRepositoryName(this, 'SuperadminBackendRepo', 'axiora/pulse-superadmin-backend');
      superadminFrontendRepo = ecr.Repository.fromRepositoryName(this, 'SuperadminFrontendRepo', 'axiora/pulse-superadmin-frontend');
    }

    // Pre Sign-up Lambda Trigger to whitelist axioraglobalsolutions.com domain
    const preSignUpTrigger = new lambda.Function(this, 'PreSignUpTrigger', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const email = event.request.userAttributes.email;
          if (email && email.toLowerCase().endsWith('@axioraglobalsolutions.com')) {
            return event;
          }
          throw new Error('Registration is restricted to @axioraglobalsolutions.com email domain.');
        };
      `),
    });

    NagSuppressions.addResourceSuppressions(preSignUpTrigger, [
      {
        id: 'AwsSolutions-L1',
        reason: 'Using stable Node.js 20.x runtime for simple inline validator.'
      }
    ]);

    if (preSignUpTrigger.role) {
      NagSuppressions.addResourceSuppressions(preSignUpTrigger.role, [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Basic execution role policy is standard and required for Lambda cloudwatch logs.'
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Basic execution role uses wildcard logs permissions.'
        }
      ]);
    }

    // 2. Cognito User Pool and Client for Customers (Open Sign-up)
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'AxioraPulseUserPool-' + envName,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      mfa: isProd ? cognito.Mfa.REQUIRED : cognito.Mfa.OFF,
      passwordPolicy: isProd ? {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      } : undefined,
    });

    // Cognito User Pool for Company Admins (Whitelisted to axioraglobalsolutions.com)
    const adminUserPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: 'AxioraPulseAdminUserPool-' + envName,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      mfa: isProd ? cognito.Mfa.REQUIRED : cognito.Mfa.OFF,
      passwordPolicy: isProd ? {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      } : undefined,
      lambdaTriggers: {
        preSignUp: preSignUpTrigger,
      },
    });

    const userPoolClient = userPool.addClient('UserPoolClient', {
      userPoolClientName: 'AxioraPulseClient-' + envName,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
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
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Cognito SMS role requires wildcard permission to publish SMS notifications to any phone number via SNS.'
      }
    ], true);

    const adminUserPoolClient = adminUserPool.addClient('AdminUserPoolClient', {
      userPoolClientName: 'AxioraPulseAdminClient-' + envName,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
    });

    NagSuppressions.addResourceSuppressions(adminUserPool, [
      {
        id: 'AwsSolutions-COG8',
        reason: 'QA/Dev Cognito admin user pool does not require advanced security features (plus tier) to manage costs.'
      },
      {
        id: 'AwsSolutions-COG1',
        reason: 'QA/Dev Cognito admin user pool does not require custom complex password policies.'
      },
      {
        id: 'AwsSolutions-COG2',
        reason: 'QA/Dev Cognito admin user pool does not require MFA to simplify developer access.'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Cognito SMS role requires wildcard permission to publish SMS notifications to any phone number via SNS.'
      }
    ], true);

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
    superadminBackendRepo.grantPull(taskExecutionRole);
    superadminFrontendRepo.grantPull(taskExecutionRole);

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

    // Allow the application container to send SMS notifications via SNS
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: ['*'],
    }));

    // Backend Fargate Service
    const backendTaskDef = new ecs.FargateTaskDefinition(this, 'BackendTaskDef', {
      memoryLimitMiB: 1024,
      cpu: 512,
      executionRole: taskExecutionRole,
      taskRole: taskRole,
      family: `pulse-backend-${shortEnv}`,
    });

    backendTaskDef.addContainer('BackendContainer', {
      image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/python:3.11-alpine'),
      command: [
        "python3",
        "-c",
        "import http.server\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b'OK')\nhttp.server.HTTPServer(('0.0.0.0', 8000), H).serve_forever()"
      ],
      portMappings: [{ containerPort: 8000 }],
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'BackendLogGroup', {
        logGroupName: `/ecs/pulse-backend-${shortEnv}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }) }),
      environment: {
        'ENVIRONMENT': shortEnv,
        'COGNITO_REGION': this.region,
        'AWS_SES_REGION': this.region,
      }
    });

    const backendService = new ecs.FargateService(this, 'BackendService', {
      cluster,
      taskDefinition: backendTaskDef,
      desiredCount: (isProd || shortEnv === 'qa') ? 2 : 1, // 2 tasks for HA in QA/Prod, 1 for Dev
      serviceName: shortEnv === 'qa' ? 'pulse-backend-qa-v2' : `pulse-backend-${shortEnv}`,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      cloudMapOptions: {
        name: shortEnv === 'qa' ? 'backend-app' : 'backend',
      },
      capacityProviderStrategies: (isProd || shortEnv === 'qa') ? undefined : [
        {
          capacityProvider: 'FARGATE_SPOT',
          weight: 1,
        }
      ],
    });

    database.connections.allowFrom(backendService, ec2.Port.tcp(5432), 'Allow backend to access database');

    let frontendUrl: string = '';
    let frontendService: ecs.FargateService | undefined = undefined;
    let superadminBackendService: ecs.FargateService | undefined = undefined;
    let superadminFrontendService: ecs.FargateService | undefined = undefined;

    // 4. Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
      loadBalancerName: `axiorapulse-${shortEnv}-alb`,
    });

    const zoneName = 'axiorapulse.com';
    const domainName = shortEnv === 'qa' ? `qa.${zoneName}` : (isProd ? zoneName : `dev.${zoneName}`);
    const hostedZoneName = shortEnv === 'qa' ? domainName : zoneName;
    let certificate: acm.ICertificate | undefined = undefined;

    if (shortEnv === 'qa' || isProd) {
      // 1. Look up Hosted Zone
      const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
        domainName: hostedZoneName,
      });

      // 2. Request Certificate
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: domainName,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });

      // 3. Create Route 53 A record pointing to the load balancer
      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(alb)),
      });

      // Set frontend URL
      frontendUrl = `https://${domainName}`;
    }

    if (shortEnv === 'dev') {
      // S3 Bucket for frontend static assets
      const frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
        bucketName: `axiorapulse-${shortEnv}-frontend-bucket`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
      });

      // CloudFront Distribution for frontend SPA
      const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
        defaultBehavior: {
          origin: new origins.S3Origin(frontendBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        additionalBehaviors: {
          '/api/*': {
            origin: new origins.HttpOrigin(alb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              httpPort: 8000,
              customHeaders: {
                'X-Forwarded-Prefix': '/api',
              }
            }),
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          }
        },
        defaultRootObject: 'index.html',
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: '/index.html',
            ttl: cdk.Duration.seconds(0),
          }
        ],
      });

      frontendUrl = `https://${distribution.distributionDomainName}`;

      new cdk.CfnOutput(this, 'FrontendCloudFrontDomain', {
        value: frontendUrl,
        description: 'Frontend CloudFront distribution URL',
      });

      // CDK-Nag Suppressions for Frontend Bucket and Distribution
      NagSuppressions.addResourceSuppressions(frontendBucket, [
        {
          id: 'AwsSolutions-S1',
          reason: 'QA/Dev S3 bucket does not require server access logging to optimize costs.'
        }
      ]);

      NagSuppressions.addResourceSuppressions(distribution, [
        {
          id: 'AwsSolutions-CFR1',
          reason: 'QA/Dev CloudFront distribution does not require geo restrictions.'
        },
        {
          id: 'AwsSolutions-CFR2',
          reason: 'QA/Dev CloudFront distribution does not require WAF integration to minimize costs.'
        },
        {
          id: 'AwsSolutions-CFR3',
          reason: 'QA/Dev CloudFront distribution does not require access logging to minimize costs.'
        },
        {
          id: 'AwsSolutions-CFR4',
          reason: 'QA/Dev CloudFront distribution uses default CloudFront certificate for simplicity.'
        },
        {
          id: 'AwsSolutions-CFR7',
          reason: 'OAI/S3Origin standard configuration is sufficient; OAC is not strictly required for QA/Dev.'
        }
      ]);
    }

    if (isProd || shortEnv === 'qa') {
      // 1. Superadmin Backend Fargate Service (Production and QA)
      const superadminBackendTaskDef = new ecs.FargateTaskDefinition(this, 'SuperadminBackendTaskDef', {
        memoryLimitMiB: 1024,
        cpu: 512,
        executionRole: taskExecutionRole,
        taskRole: taskRole,
        family: `pulse-superadmin-backend-${shortEnv}`,
      });

      superadminBackendTaskDef.addContainer('SuperadminBackendContainer', {
        image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/python:3.11-alpine'),
        command: [
          "python3",
          "-c",
          "import http.server\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b'OK')\nhttp.server.HTTPServer(('0.0.0.0', 8001), H).serve_forever()"
        ],
        portMappings: [{ containerPort: 8001 }],
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'SuperadminBackendLogGroup', {
          logGroupName: `/ecs/pulse-superadmin-backend-${shortEnv}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }) }),
        environment: {
          'ENVIRONMENT': shortEnv,
          'COGNITO_REGION': this.region,
          'SUPER_ADMIN_COGNITO_REGION': this.region,
          'MOCK_COGNITO': 'false',
        }
      });

      NagSuppressions.addResourceSuppressions(superadminBackendTaskDef, [
        {
          id: 'AwsSolutions-ECS2',
          reason: 'Superadmin backend environment variables only contain non-sensitive configuration values.'
        }
      ]);

      superadminBackendService = new ecs.FargateService(this, 'SuperadminBackendService', {
        cluster,
        taskDefinition: superadminBackendTaskDef,
        desiredCount: 2,
        serviceName: `pulse-superadmin-backend-${shortEnv}`,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
        cloudMapOptions: {
          name: 'superadmin-backend',
        },
        capacityProviderStrategies: isProd ? undefined : [
          {
            capacityProvider: 'FARGATE_SPOT',
            weight: 1,
          }
        ],
      });

      database.connections.allowFrom(superadminBackendService, ec2.Port.tcp(5432), 'Allow superadmin backend to access database');

      // 2. Frontend Fargate Service (Production and QA)
      const frontendTaskDef = new ecs.FargateTaskDefinition(this, 'FrontendTaskDef', {
        memoryLimitMiB: 512,
        cpu: 256,
        executionRole: taskExecutionRole,
        taskRole: taskRole,
        family: `pulse-frontend-${shortEnv}`,
      });

      frontendTaskDef.addContainer('FrontendContainer', {
        image: ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:alpine'),
        portMappings: [{ containerPort: 80 }],
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'FrontendLogGroup', {
          logGroupName: `/ecs/pulse-frontend-${shortEnv}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }) }),
        environment: {
          'BACKEND_INTERNAL_URL': `backend.${shortEnv}.local:8000`,
        }
      });

      NagSuppressions.addResourceSuppressions(frontendTaskDef, [
        {
          id: 'AwsSolutions-ECS2',
          reason: 'Frontend environment variables only contain non-sensitive configuration values.'
        }
      ]);

      frontendService = new ecs.FargateService(this, 'FrontendService', {
        cluster,
        taskDefinition: frontendTaskDef,
        desiredCount: 2,
        serviceName: `pulse-frontend-${shortEnv}`,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
      });

      // 3. Superadmin Frontend Fargate Service (Production and QA)
      const superadminFrontendTaskDef = new ecs.FargateTaskDefinition(this, 'SuperadminFrontendTaskDef', {
        memoryLimitMiB: 512,
        cpu: 256,
        executionRole: taskExecutionRole,
        taskRole: taskRole,
        family: `pulse-superadmin-frontend-${shortEnv}`,
      });

      superadminFrontendTaskDef.addContainer('SuperadminFrontendContainer', {
        image: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/python:3.11-alpine'),
        command: [
          "python3",
          "-c",
          "import http.server\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.end_headers()\n        self.wfile.write(b'OK')\nhttp.server.HTTPServer(('0.0.0.0', 80), H).serve_forever()"
        ],
        portMappings: [{ containerPort: 80 }],
        logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ecs', logGroup: new cdk.aws_logs.LogGroup(this, 'SuperadminFrontendLogGroup', {
          logGroupName: `/ecs/pulse-superadmin-frontend-${shortEnv}`,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }) }),
        environment: {
          'BACKEND_INTERNAL_URL': `superadmin-backend.${shortEnv}.local:8001`,
        }
      });

      NagSuppressions.addResourceSuppressions(superadminFrontendTaskDef, [
        {
          id: 'AwsSolutions-ECS2',
          reason: 'Superadmin frontend environment variables only contain non-sensitive configuration values.'
        }
      ]);

      superadminFrontendService = new ecs.FargateService(this, 'SuperadminFrontendService', {
        cluster,
        taskDefinition: superadminFrontendTaskDef,
        desiredCount: 2,
        serviceName: `pulse-superadmin-frontend-${shortEnv}`,
        vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        assignPublicIp: false,
      });

      superadminBackendService.connections.allowFrom(superadminFrontendService, ec2.Port.tcp(8001), 'Allow internal superadmin frontend to superadmin backend traffic');
    }

    if (isProd) {
      const backendScaling = backendService.autoScaleTaskCount({ maxCapacity: 10, minCapacity: 2 });
      backendScaling.scaleOnCpuUtilization('BackendCpuScaling', { targetUtilizationPercent: 70 });
      backendScaling.scaleOnMemoryUtilization('BackendMemoryScaling', { targetUtilizationPercent: 70 });

      if (frontendService) {
        const frontendScaling = frontendService.autoScaleTaskCount({ maxCapacity: 10, minCapacity: 2 });
        frontendScaling.scaleOnCpuUtilization('FrontendCpuScaling', { targetUtilizationPercent: 70 });
        frontendScaling.scaleOnMemoryUtilization('FrontendMemoryScaling', { targetUtilizationPercent: 70 });
      }
    } else if (shortEnv === 'qa') {
      // Scheduled scaling to scale down to 0 at night/weekends for QA backend
      const backendScaling = backendService.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 0 });
      backendScaling.scaleOnSchedule('ScaleDownQA', {
        schedule: appscaling.Schedule.cron({ hour: '14', minute: '30', weekDay: 'MON-FRI' }), // 8:00 PM IST / 2:30 PM UTC
        minCapacity: 0,
        maxCapacity: 0,
      });
      backendScaling.scaleOnSchedule('ScaleUpQA', {
        schedule: appscaling.Schedule.cron({ hour: '3', minute: '30', weekDay: 'MON-FRI' }), // 9:00 AM IST / 3:30 AM UTC
        minCapacity: 2,
        maxCapacity: 2,
      });

      if (frontendService) {
        // Scheduled scaling to scale down to 0 at night/weekends for QA frontend
        const frontendScaling = frontendService.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 0 });
        frontendScaling.scaleOnSchedule('FrontendScaleDownQA', {
          schedule: appscaling.Schedule.cron({ hour: '14', minute: '30', weekDay: 'MON-FRI' }), // 8:00 PM IST / 2:30 PM UTC
          minCapacity: 0,
          maxCapacity: 0,
        });
        frontendScaling.scaleOnSchedule('FrontendScaleUpQA', {
          schedule: appscaling.Schedule.cron({ hour: '3', minute: '30', weekDay: 'MON-FRI' }), // 9:00 AM IST / 3:30 AM UTC
          minCapacity: 2,
          maxCapacity: 2,
        });
      }

      if (superadminBackendService) {
        const superadminBackendScaling = superadminBackendService.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 0 });
        superadminBackendScaling.scaleOnSchedule('SuperadminBackendScaleDownQA', {
          schedule: appscaling.Schedule.cron({ hour: '14', minute: '30', weekDay: 'MON-FRI' }),
          minCapacity: 0,
          maxCapacity: 0,
        });
        superadminBackendScaling.scaleOnSchedule('SuperadminBackendScaleUpQA', {
          schedule: appscaling.Schedule.cron({ hour: '3', minute: '30', weekDay: 'MON-FRI' }),
          minCapacity: 2,
          maxCapacity: 2,
        });
      }

      if (superadminFrontendService) {
        const superadminFrontendScaling = superadminFrontendService.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 0 });
        superadminFrontendScaling.scaleOnSchedule('SuperadminFrontendScaleDownQA', {
          schedule: appscaling.Schedule.cron({ hour: '14', minute: '30', weekDay: 'MON-FRI' }),
          minCapacity: 0,
          maxCapacity: 0,
        });
        superadminFrontendScaling.scaleOnSchedule('SuperadminFrontendScaleUpQA', {
          schedule: appscaling.Schedule.cron({ hour: '3', minute: '30', weekDay: 'MON-FRI' }),
          minCapacity: 2,
          maxCapacity: 2,
        });
      }
    }


    if (frontendService) {
      if (certificate) {
        // HTTPS Listener on port 443
        const httpsListener = alb.addListener('HttpsListener', {
          port: 443,
          protocol: elbv2.ApplicationProtocol.HTTPS,
          certificates: [elbv2.ListenerCertificate.fromArn(certificate.certificateArn)],
          open: true,
        });

        httpsListener.addTargets('FrontendTargetHTTPS', {
          port: 80,
          targets: [frontendService],
          healthCheck: {
            path: '/',
          }
        });

        if (superadminFrontendService && superadminBackendService) {
          httpsListener.addTargets('SuperadminFrontendTargetHTTPS', {
            port: 80,
            targets: [superadminFrontendService],
            priority: 10,
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/super-admin', '/super-admin/*'])
            ],
            healthCheck: {
              path: '/super-admin/',
            }
          });

          httpsListener.addTargets('SuperadminBackendTargetHTTPS', {
            port: 8001,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [superadminBackendService],
            priority: 20,
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/super-admin-api', '/super-admin-api/*'])
            ],
            healthCheck: {
              path: '/docs',
            }
          });
        }

        // Reuse the existing port 80 listener when enabling HTTPS so CloudFormation
        // updates it in place instead of creating a second listener on the same port.
        alb.addListener('FrontendListener', {
          port: 80,
          protocol: elbv2.ApplicationProtocol.HTTP,
          open: true,
          defaultAction: elbv2.ListenerAction.redirect({
            port: '443',
            protocol: elbv2.ApplicationProtocol.HTTPS,
            permanent: true,
          }),
        });
      } else {
        // Fallback for HTTP if no certificate is defined (e.g. dev environment)
        const frontendListener = alb.addListener('FrontendListener', {
          port: 80,
          protocol: elbv2.ApplicationProtocol.HTTP,
          open: true,
        });

        frontendListener.addTargets('FrontendTarget', {
          port: 80,
          targets: [frontendService],
          healthCheck: {
            path: '/',
          }
        });

        if (superadminFrontendService && superadminBackendService) {
          frontendListener.addTargets('SuperadminFrontendTarget', {
            port: 80,
            targets: [superadminFrontendService],
            priority: 10,
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/super-admin', '/super-admin/*'])
            ],
            healthCheck: {
              path: '/super-admin/',
            }
          });

          frontendListener.addTargets('SuperadminBackendTarget', {
            port: 8001,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targets: [superadminBackendService],
            priority: 20,
            conditions: [
              elbv2.ListenerCondition.pathPatterns(['/super-admin-api', '/super-admin-api/*'])
            ],
            healthCheck: {
              path: '/docs',
            }
          });
        }
      }
    }

    // Backend Listener
    let backendListener: elbv2.ApplicationListener;
    if (certificate) {
      backendListener = alb.addListener('BackendListener', {
        port: 8000,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [elbv2.ListenerCertificate.fromArn(certificate.certificateArn)],
        open: true,
      });
    } else {
      backendListener = alb.addListener('BackendListener', {
        port: 8000,
        protocol: elbv2.ApplicationProtocol.HTTP,
        open: true,
      });
    }

    backendListener.addTargets('BackendTarget', {
      port: 8000,
      targets: [backendService],
      healthCheck: {
        path: '/health',
      }
    });

    if (frontendService) {
      // Allow frontend to communicate with backend internally
      backendService.connections.allowFrom(frontendService, ec2.Port.tcp(8000), 'Allow internal frontend to backend traffic');
    }

    // 5. SSM Parameters
    const userPoolIdParam = new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_USER_POOL_ID`,
      stringValue: userPool.userPoolId,
    });

    const userPoolClientIdParam = new ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/COGNITO_APP_CLIENT_ID`,
      stringValue: userPoolClient.userPoolClientId,
    });

    // Admin Cognito Parameters
    const adminUserPoolIdParam = new ssm.StringParameter(this, 'AdminUserPoolIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/SUPER_ADMIN_COGNITO_USER_POOL_ID`,
      stringValue: adminUserPool.userPoolId,
    });

    const adminUserPoolClientIdParam = new ssm.StringParameter(this, 'AdminUserPoolClientIdParam', {
      parameterName: `/axiorapulse/${shortEnv}/SUPER_ADMIN_COGNITO_APP_CLIENT_ID`,
      stringValue: adminUserPoolClient.userPoolClientId,
    });

    const ecsClusterNameParam = new ssm.StringParameter(this, 'EcsClusterNameParam', {
      parameterName: `/axiorapulse/${shortEnv}/ECS_CLUSTER_NAME`,
      stringValue: cluster.clusterName,
    });

    if (isProd || shortEnv === 'qa') {
      const superAdminFrontendUrlParam = new ssm.StringParameter(this, 'SuperAdminFrontendUrlParam', {
        parameterName: `/axiorapulse/${shortEnv}/SUPER_ADMIN_FRONTEND_URL`,
        stringValue: `https://${domainName}/super-admin/`,
      });
      if (superadminBackendService) {
        superadminBackendService.node.addDependency(superAdminFrontendUrlParam);
      }
    }

    const frontendUrlParam = new ssm.StringParameter(this, 'FrontendUrlParam', {
      parameterName: `/axiorapulse/${shortEnv}/FRONTEND_URL`,
      stringValue: frontendUrl,
    });

    backendService.node.addDependency(dbHostParam);
    backendService.node.addDependency(dbPortParam);
    backendService.node.addDependency(dbNameParam);
    backendService.node.addDependency(dbSecretArnParam);
    backendService.node.addDependency(userPoolIdParam);
    backendService.node.addDependency(userPoolClientIdParam);
    backendService.node.addDependency(ecsClusterNameParam);
    backendService.node.addDependency(frontendUrlParam);
    backendService.node.addDependency(adminUserPoolIdParam);
    backendService.node.addDependency(adminUserPoolClientIdParam);

    if (superadminBackendService) {
      superadminBackendService.node.addDependency(dbHostParam);
      superadminBackendService.node.addDependency(dbPortParam);
      superadminBackendService.node.addDependency(dbNameParam);
      superadminBackendService.node.addDependency(dbSecretArnParam);
      superadminBackendService.node.addDependency(adminUserPoolIdParam);
      superadminBackendService.node.addDependency(adminUserPoolClientIdParam);
      superadminBackendService.node.addDependency(ecsClusterNameParam);
    }

    if (frontendService) {
      frontendService.node.addDependency(userPoolIdParam);
      frontendService.node.addDependency(userPoolClientIdParam);
      frontendService.node.addDependency(ecsClusterNameParam);
      frontendService.node.addDependency(frontendUrlParam);
    }

    if (superadminFrontendService) {
      superadminFrontendService.node.addDependency(adminUserPoolIdParam);
      superadminFrontendService.node.addDependency(adminUserPoolClientIdParam);
      superadminFrontendService.node.addDependency(ecsClusterNameParam);
    }

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
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'ECS Task role needs wildcard permission to publish SMS notifications to any phone number via SNS.'
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
    if (frontendService) {
      new cdk.CfnOutput(this, 'FrontendServiceName', { value: frontendService.serviceName });
    }
    if (superadminBackendService) {
      new cdk.CfnOutput(this, 'SuperadminBackendServiceName', { value: superadminBackendService.serviceName });
    }
    if (superadminFrontendService) {
      new cdk.CfnOutput(this, 'SuperadminFrontendServiceName', { value: superadminFrontendService.serviceName });
    }
    new cdk.CfnOutput(this, 'EcsClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: alb.loadBalancerDnsName });
  }
}
