# Stage 1: Build the React/Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# VITE_ vars must be present at build time (baked into the JS bundle)
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_APP_CLIENT_ID
ARG VITE_FRONTEND_URL
ARG VITE_API_BASE_URL
ARG VITE_APP_ENV
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_TRACES_SAMPLE_RATE
ARG VITE_SENTRY_PROFILES_SAMPLE_RATE
ENV VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID
ENV VITE_COGNITO_APP_CLIENT_ID=$VITE_COGNITO_APP_CLIENT_ID
ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_ENV=$VITE_APP_ENV
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE
ENV VITE_SENTRY_PROFILES_SAMPLE_RATE=$VITE_SENTRY_PROFILES_SAMPLE_RATE

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
