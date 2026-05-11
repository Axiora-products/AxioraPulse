#!/bin/bash

# Check if we're running in local mode (db service available) or production (Supabase)
# DATABASE_URL should be set via environment
if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"db:"* ]]; then
    echo "Waiting for local database..."
    python -c "
import time
import psycopg2
while True:
    try:
        conn = psycopg2.connect('$DATABASE_URL')
        conn.close()
        break
    except:
        time.sleep(1)
"
    echo "Local database is ready!"
else
    echo "Connecting to production database (Supabase)..."
    sleep 2  # Give Supabase connection time to establish
fi

# Run Alembic migrations
echo "Running database migrations..."
alembic upgrade head

echo "Database setup complete!"

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port 8000