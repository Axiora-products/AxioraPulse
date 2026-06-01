# Stage 1: Build the React/Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# VITE_ vars must be present at build time (baked into the JS bundle)
ARG VITE_COGNITO_USER_POOL_ID
ARG VITE_COGNITO_APP_CLIENT_ID
ARG VITE_FRONTEND_URL
ARG VITE_API_BASE_URL
ENV VITE_COGNITO_USER_POOL_ID=$VITE_COGNITO_USER_POOL_ID
ENV VITE_COGNITO_APP_CLIENT_ID=$VITE_COGNITO_APP_CLIENT_ID
ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

# Update backend ALB DNS name dynamically in nginx.conf if VITE_API_BASE_URL is a load balancer URL
RUN if [ -n "$VITE_API_BASE_URL" ] && echo "$VITE_API_BASE_URL" | grep -q "elb.amazonaws.com"; then \
        ALB_HOST=$(echo "$VITE_API_BASE_URL" | sed -e 's/https:\/\///' -e 's/http:\/\///' -e 's/\/.*//'); \
        sed -i "s|proxy_pass http://[^;]*;|proxy_pass http://${ALB_HOST}/;|g" nginx.conf; \
    fi

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
