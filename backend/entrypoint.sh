#!/bin/bash
set -e

# Wait for database with a retry limit (max 30 attempts, 2s apart = 60s)
if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"db:"* ]]; then
    echo "Waiting for local database..."
    MAX_RETRIES=30
    RETRY=0
    until python -c "
import psycopg2, os, sys
try:
    psycopg2.connect(os.environ['DATABASE_URL']).close()
    sys.exit(0)
except:
    sys.exit(1)
" ; do
        RETRY=$((RETRY + 1))
        if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
            echo "ERROR: Database not reachable after $MAX_RETRIES attempts. Exiting."
            exit 1
        fi
        echo "Waiting for database... ($RETRY/$MAX_RETRIES)"
        sleep 2
    done
    echo "Local database is ready!"
fi

# Apply all pending Alembic migrations
echo "Running database migrations..."
alembic upgrade head
echo "Database setup complete!"

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
