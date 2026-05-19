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

## 🏗️ PRODUCTION BUILD (ECR + ECS + Aurora RDS)

### Build for Production
```bash
# Build using optimized multi-stage Dockerfile
docker build -f backend/Dockerfile.prod -t pulse-backend:latest ./backend

# Run locally to test (requires Aurora RDS DATABASE_URL set)
docker run -e DATABASE_URL="postgresql://..." pulse-backend:latest
```

### Deploy to ECR
```bash
# 1. Authenticate with ECR
aws ecr get-login-password --region ap-south-1 | \
  docker login --username AWS --password-stdin 217757579310.dkr.ecr.ap-south-1.amazonaws.com

# 2. Tag image
docker tag pulse-backend:latest \
  217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi:latest

# 3. Push to ECR
docker push 217757579310.dkr.ecr.ap-south-1.amazonaws.com/axiora/pulse-fastapi:latest

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

### Production (AWS SSM Parameter Store)
```bash
DATABASE_URL=postgresql://postgres:PASSWORD@axiorapulse-db.xxxx.ap-south-1.rds.amazonaws.com:5432/postgres
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
aws logs tail /ecs/pulse-backend --follow
```

### Health check
```bash
curl https://api.axiorapulse.com/health
```

---

## 📝 DATABASE NOTES

### Local Development
- Database runs in Docker
- Data persists in `postgres_data` volume
- Schema auto-created on startup

### Production (Aurora RDS)
- Managed AWS database (PostgreSQL 16+)
- Backend connects via connection string in SSM
- Migrations run automatically in ECS task
- Automated backups and high availability

---

## 👥 FOR TEAM MEMBERS

### Backend Developer
- Clone repo → `git checkout main`
- Make changes in `feature/feature-name` branch
- Test locally: `docker-compose up`
- Push and open PR to `main`

### Frontend Developer
- Uses `vite.config.js` for dev server
- Backend API available at http://localhost:8000
- Can run independently or with `docker-compose up`

### DevOps/Deployment
- Secrets managed in SSM Parameter Store
- ECS task definitions in `backend/ecs-task-def.json`
- Rollback: Revert commit to `main`, push again
- Scale: Adjust desired count in ECS service

---

## ⚠️ IMPORTANT

- **Never** commit `.env.production.example` with real values
- Use AWS Secrets Manager for all production secrets
- Keep `docker-compose.yml` for local dev only
- Use `docker-compose.prod.yml` reference (not needed locally)
- Database separation complete: local DB != production DB
