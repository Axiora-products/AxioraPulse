import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

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

    const githubProviderArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;

    // 1. Create the GitHub Deployer Role
    const githubDeployerRole = new iam.Role(this, 'GitHubDeployerRole', {
      roleName: 'GitHubActionDeployerRole',
      assumedBy: new iam.FederatedPrincipal(
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
      description: 'Role assumed by GitHub Actions for OIDC-based deployments',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // 2. Add Permissions for ECR
    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
      ],
      resources: ['*'],
    }));

    githubDeployerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
      ],
      resources: [
        `arn:aws:ecr:${this.region}:${this.account}:repository/axiora/*`,
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
        `arn:aws:iam::${this.account}:role/ecsTaskExecutionRole`,
        `arn:aws:iam::${this.account}:role/ecsTaskRole`,
      ],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ecs-tasks.amazonaws.com',
        },
      },
    }));

    // Outputs
    new cdk.CfnOutput(this, 'GitHubDeployerRoleArn', {
      value: githubDeployerRole.roleArn,
      description: 'The ARN of the IAM Role for GitHub Actions',
    });
  }
}
