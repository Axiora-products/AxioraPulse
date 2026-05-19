# AxioraPulse CDK Infrastructure

This directory contains the AWS CDK infrastructure for AxioraPulse, reverse-engineered from the production environment. It is designed to deploy identical stacks for **Dev** and **QA** environments in separate AWS accounts.

## Architecture

The infrastructure includes:
- **VPC:** Dedicated VPC with Public and Private subnets.
- **RDS:** PostgreSQL 16.6 instance (db.t3.micro).
- **Cognito:** User Pool and Client for authentication.
- **ECS Cluster:** Fargate-based cluster.
- **ALBs:** Two Application Load Balancers (Frontend and Backend).
- **ECS Services:** Fargate services for the FastAPI backend and Nginx frontend.
- **SSM Parameters:** Standardized configuration and secrets management.

## Prerequisites

1.  **AWS CDK CLI:** Installed globally (`npm install -g aws-cdk`).
2.  **AWS Accounts:** Two separate AWS accounts for Dev and QA.
3.  **Bootstrap:** Each account/region must be bootstrapped for CDK:
    ```bash
    npx cdk bootstrap aws://ACCOUNT_ID/REGION
    ```

## Deployment

### 1. Set Environment Variables

Before deploying, set the following environment variables (or update `bin/cdk.ts`):

```bash
export CDK_DEV_ACCOUNT=123456789012
export CDK_DEV_REGION=ap-south-1

export CDK_QA_ACCOUNT=987654321098
export CDK_QA_REGION=ap-south-1
```

### 2. Prepare SSM Parameters

The CDK stack expects the following SSM parameters to exist in the target account/region before deployment (or they will fail to fetch during synthesis/deployment if using `fromSsmParameter` - wait, actually `fromSsmParameter` works during deployment, but `SecureString` requires some care).

**Note:** For Dev/QA, you should create these parameters manually or via a separate script:
- `/axiorapulse/{env}/DATABASE_URL` (SecureString)
- `/axiorapulse/{env}/SECRET_KEY` (SecureString)
- `/axiorapulse/{env}/ANTHROPIC_KEY` (SecureString)
- `/axiorapulse/{env}/EMAIL_FROM` (SecureString)
- `/axiorapulse/{env}/FRONTEND_URL` (SecureString)
- `/axiorapulse/{env}/RAZORPAY_KEY_ID` (SecureString)
- `/axiorapulse/{env}/RAZORPAY_KEY_SECRET` (SecureString)
- `/axiorapulse/{env}/COGNITO_USER_POOL_ID` (String)
- `/axiorapulse/{env}/COGNITO_APP_CLIENT_ID` (String)

### 3. Deploy

Deploy the desired environment:

```bash
# Deploy Dev
npx cdk deploy AxioraPulseStackDev

# Deploy QA
npx cdk deploy AxioraPulseStackQa
```

## Maintenance

To see the difference between your local code and the deployed stack:
```bash
npx cdk diff AxioraPulseStackDev
```

To destroy the infrastructure (be careful!):
```bash
npx cdk destroy AxioraPulseStackDev
```
