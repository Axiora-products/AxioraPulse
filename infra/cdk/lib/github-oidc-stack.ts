import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';

export interface GitHubOidcStackProps extends cdk.StackProps {
  repositoryConfig: {
    owner: string;
    repo: string;
    filter?: string;
  }[];
}

export class GitHubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GitHubOidcStackProps) {
    super(scope, id, props);

    // 0. Reference the existing GitHub OIDC Provider
    const githubProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

    // 1. Create the GitHub Deployer Role
    const githubDeployerRole = new iam.Role(this, 'GitHubDeployerRole', {
      roleName: 'GitHubActionsDeployerRole',
      assumedBy: new iam.CompositePrincipal(
        new iam.FederatedPrincipal(
          githubProviderArn,
          {
            StringLike: {
              'token.actions.githubusercontent.com:sub': props.repositoryConfig.map(
                (config) => `repo:${config.owner}/${config.repo}:${config.filter ?? '*'}`
              ),
            },
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
        new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      ),
      description: 'Role assumed by GitHub Actions for OIDC-based deployments and used as ECS Task/Execution role',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // 2. Add Permissions for ECR
    githubDeployerRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'));
    githubDeployerRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMReadOnlyAccess'));
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
      ],
      resources: ['*'],
    }));

    // Allow pushing only to local account repos
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/axiora/*`,
      ],
    }));

    // Allow pulling from any axiora repository (required for cross-account promotion)
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:*:repository/axiora/*`,
      ],
    }));

    // 3. Add Permissions for ECS
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecs:RegisterTaskDefinition',
        'ecs:UpdateService',
        'ecs:DescribeServices',
        'ecs:DescribeTaskDefinition',
      ],
      resources: ['*'], // Can be scoped to specific clusters if needed
    }));

    // 4. Add IAM PassRole permission
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        githubDeployerRole.roleArn,
        `arn:aws:iam::${this.account}:role/ecsTaskExecutionRole*`,
        `arn:aws:iam::${this.account}:role/ecsTaskRole*`,
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ecs-tasks.amazonaws.com',
        },
      },
    }));

    // 5. Add Permissions for CDK Deployments
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-*`,
      ],
    }));

    // CDK-Nag Suppressions
    NagSuppressions.addResourceSuppressions(githubDeployerRole, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'OIDC deployer role requires standard managed policies for ECS task execution and SSM read access.'
      },
      {
        id: 'AwsSolutions-IAM5',
        reason: 'OIDC deployer role requires wildcard permissions for ECR authorization, pushing/pulling images, ECS task management, and PassRole/AssumeRole for CDK and ECS.'
      }
    ], true);

    // Outputs
    new cdk.CfnOutput(this, 'GitHubDeployerRoleArn', {
      value: githubDeployerRole.roleArn,
      description: 'The ARN of the IAM Role for GitHub Actions',
    });
  }
}
