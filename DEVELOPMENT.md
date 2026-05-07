# Quick Development & Deployment Reference

## 🚀 LOCAL DEVELOPMENT

### Start everything (Backend + Database)
```bash
docker-compose up
```

**Available:**
- Backend API: http://localhost:8000
- API Docs (Swagger): http://localhost:8000/docs
- Database: postgresql://postgres:root@localhost:5432/nexpulse

### Environment
- Uses `docker-compose.yml`
- Database automatically started with the backend
- Migrations run automatically in entrypoint

---

## 🏗️ PRODUCTION BUILD (ECR + ECS + Supabase)

### Build for Production
```bash
# Build using optimized multi-stage Dockerfile
docker build -f backend/Dockerfile.prod -t axiora-backend:latest ./backend

# Run locally to test (requires Supabase DATABASE_URL set)
docker run -e DATABASE_URL="postgresql://..." axiora-backend:latest
```

### Deploy to ECR
```bash
# 1. Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

# 2. Tag image
docker tag axiora-backend:latest \
  YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/axiora-backend:latest

# 3. Push to ECR
docker push YOUR_AWS_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/axiora-backend:latest

# 4. Update ECS (auto-deploy via CI/CD in main branch)
```

---

## 📊 ENVIRONMENT SETUP

### Local Development (.env.local)
```bash
DATABASE_URL=postgresql://postgres:root@db:5432/nexpulse
SECRET_KEY=dev-key-change-in-prod
ENVIRONMENT=development
```

### Production (AWS Secrets Manager)
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@PROJECT.supabase.co:5432/postgres
SECRET_KEY=production-secret-key-min-32-chars
ENVIRONMENT=production
```

**Never commit production secrets!**

---

## 🔄 GIT WORKFLOW (for team)

### Branch naming
- Feature: `feature/feature-name`
- Backend: `backend/feature-name`  
- Frontend: `frontend/feature-name`
- Bug fix: `bugfix/issue-name`

### Deploy to Production
1. Create feature branch from `staging`
2. Open PR to `staging`
3. Code review + merge
4. QA validates on staging
5. Merge `staging` → `main` (triggers auto-deploy)

### CI/CD Pipeline
- Push to `main` → GitHub Actions builds
- Docker image pushed to ECR
- ECS updates service automatically
- No manual deployment needed!

---

## 🐛 DEBUGGING

### Local: View backend logs
```bash
docker-compose logs -f backend
```

### Local: Access database
```bash
psql postgresql://postgres:root@localhost:5432/nexpulse
```

### Production: CloudWatch logs
```bash
aws logs tail /ecs/axiora-backend --follow
```

### Health check
```bash
curl http://localhost:8000/health
```

---

## 📝 DATABASE NOTES

### Local Development
- Database runs in Docker
- Data persists in `postgres_data` volume
- Schema auto-created on startup

### Production (Supabase)
- External managed database
- Backend connects via connection string
- Migrations run automatically in ECS task
- Backups managed by Supabase

---

## 👥 FOR TEAM MEMBERS

### Backend Developer
- Clone repo → `git checkout staging`
- Make changes in `backend/feature-name` branch
- Test locally: `docker-compose up`
- Push and open PR to `staging`

### Frontend Developer
- Uses `vite.config.js` for dev server
- Backend API available at http://localhost:8000
- Can run independently or with `docker-compose up`

### DevOps/Deployment
- Secrets managed in AWS Secrets Manager
- ECS task definitions in DEPLOYMENT.md
- Rollback: Revert commit to `main`, push again
- Scale: Adjust desired count in ECS service

---

## ⚠️ IMPORTANT

- **Never** commit `.env.production.example` with real values
- Use AWS Secrets Manager for all production secrets
- Keep `docker-compose.yml` for local dev only
- Use `docker-compose.prod.yml` reference (not needed locally)
- Database separation complete: local DB != production DB
