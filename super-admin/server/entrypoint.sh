#!/bin/bash

# Ensure DATABASE_URL is set or can be constructed
if [ -z "$DATABASE_URL" ]; then
    if [ -n "$DB_HOST" ] && [ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ]; then
        echo "DATABASE_URL is not set. Constructing from database environment variables..."
        export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:${DB_PORT:-5432}/${DB_NAME:-axiorapulse}"
    else
        echo "ERROR: DATABASE_URL environment variable is not set and connection variables are missing."
        exit 1
    fi
fi

# Start the application
exec uvicorn main:app --host 0.0.0.0 --port 8001
