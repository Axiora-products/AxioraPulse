# Production Deployment Guide

## Architecture Overview

### Local Development
```
docker-compose.yml
├── Backend Service (FastAPI)
└── PostgreSQL Service (local database)
```
- **Command**: `docker-compose up`
- Database included for convenience
- Code mounted as volume for hot-reload

### Production (AWS ECS + Supabase)
```
ECR (Docker Image)
    ↓
ECS Task Definition
    ↓
ECS Service/Fargate
    ↓
Supabase PostgreSQL (external)
```
- **Only backend image** in ECR
- Database managed externally by Supabase
- Scalable, managed infrastructure

---

## Step 1: Build & Push Backend to ECR

### Set up AWS credentials
```bash
aws configure
# Enter your AWS Access Key ID and Secret Access Key
```

### Create ECR repository
```bash
aws ecr create-repository --repository-name axiora-backend --region us-east-1
```

### Build and push Docker image
```bash
# Build using production Dockerfile
docker build -f backend/Dockerfile.prod -t axiora-backend:latest ./backend

# Tag for ECR
docker tag axiora-backend:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/axiora-backend:latest

# Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

# Push to ECR
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/axiora-backend:latest
```

---

## Step 2: Set up Supabase Database

### Create Supabase project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Copy the connection string from Settings → Database
   - Format: `postgresql://postgres:[PASSWORD]@[PROJECT-ID].supabase.co:5432/postgres?sslmode=require`

### Run migrations
```bash
# Connect to Supabase and run Alembic migrations
DATABASE_URL="postgresql://..." alembic upgrade head
```

---

## Step 3: Create ECS Task Definition

### JSON Task Definition (`ecs-task-definition.json`)
```json
{
  "family": "axiora-backend",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "backend",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/axiora-backend:latest",
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "ENVIRONMENT",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:axiora-db-url"
        },
        {
          "name": "SECRET_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:axiora-secret-key"
        },
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789:secret:openai-key"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/axiora-backend",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 3,
        "startPeriod": 40
      }
    }
  ],
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole"
}
```

### Store secrets in AWS Secrets Manager
```bash
# Store DATABASE_URL
aws secretsmanager create-secret \
  --name axiora-db-url \
  --secret-string "postgresql://postgres:PASSWORD@PROJECT-ID.supabase.co:5432/postgres?sslmode=require"

# Store SECRET_KEY
aws secretsmanager create-secret \
  --name axiora-secret-key \
  --secret-string "your-super-secret-production-key"

# Store API keys
aws secretsmanager create-secret \
  --name openai-key \
  --secret-string "sk-your-key"
```

### Register task definition
```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json
```

---

## Step 4: Create ECS Cluster & Service

### Create Fargate cluster
```bash
aws ecs create-cluster --cluster-name axiora-prod
```

### Create ECS service
```bash
aws ecs create-service \
  --cluster axiora-prod \
  --service-name axiora-backend-service \
  --task-definition axiora-backend:1 \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx],assignPublicIp=ENABLED}" \
  --load-balancers targetGroupArn=arn:aws:elasticloadbalancing:...,containerName=backend,containerPort=8000
```

---

## Step 5: Deploy with CI/CD (GitHub Actions)

### `.github/workflows/deploy-prod.yml`
```yaml
name: Deploy to ECS

on:
  push:
    branches:
      - main

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: axiora-backend

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to ECR
        run: |
          aws ecr get-login-password --region ${{ env.AWS_REGION }} | \
          docker login --username AWS --password-stdin \
          ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com
      
      - name: Build and push Docker image
        run: |
          docker build -f backend/Dockerfile.prod -t ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com/${{ env.ECR_REPOSITORY }}:latest ./backend
          docker push ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com/${{ env.ECR_REPOSITORY }}:latest
      
      - name: Update ECS service
        run: |
          aws ecs update-service \
            --cluster axiora-prod \
            --service axiora-backend-service \
            --force-new-deployment
```

---

## Development Workflow

### Local: Run with local database
```bash
# Start both backend and database
docker-compose up

# Backend available at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Production: Managed by ECS
- Code push to `main` branch
- GitHub Actions builds image
- Image pushed to ECR
- ECS automatically deploys
- Connects to Supabase database

---

## Key Differences

| Aspect | Local | Production |
|--------|-------|-----------|
| **Database** | PostgreSQL in docker-compose | Supabase (external) |
| **Image** | Dockerfile (dev friendly) | Dockerfile.prod (optimized) |
| **Environment** | .env.local | AWS Secrets Manager |
| **Deployment** | `docker-compose up` | ECS Service |
| **Scaling** | Manual | Auto-scaling via ECS |
| **Monitoring** | Local logs | CloudWatch logs |

---

## Troubleshooting

### Backend can't connect to Supabase
- Check DATABASE_URL in Secrets Manager
- Verify SSL mode is `require`
- Check security group allows outbound HTTPS

### ECS task keeps failing
- Check CloudWatch logs: `/ecs/axiora-backend`
- Verify secrets are accessible by task role
- Check health check endpoint at `/health`

### Database migration fails
- Run migrations before deploying: `alembic upgrade head`
- Check Supabase has correct schema
- Verify DATABASE_URL permissions
