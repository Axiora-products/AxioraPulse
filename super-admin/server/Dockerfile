# Stage 1: Build dependencies
FROM python:3.12-slim as builder

WORKDIR /app

COPY super-admin/server/requirements.txt .

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Runtime
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy backend for database models and super-admin server code
COPY backend /backend
COPY super-admin/server /app

# Normalize Windows line endings and keep the entrypoint outside mounted source
RUN sed -i 's/\r$//' entrypoint.sh \
    && cp entrypoint.sh /usr/local/bin/superadmin-entrypoint.sh \
    && chmod +x /usr/local/bin/superadmin-entrypoint.sh

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8001/docs || exit 1

ENTRYPOINT ["/usr/local/bin/superadmin-entrypoint.sh"]
