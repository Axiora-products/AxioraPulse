#!/bin/bash

# Ensure DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set."
    exit 1
fi

echo "Waiting for database to be ready..."

# Wait loop for database connectivity
# Handles local, Supabase (historical), and Aurora RDS.
# We strip SQLAlchemy driver prefixes (like +psycopg2) for the psycopg2 check.
python -c "
import time
import psycopg2
import os
import sys

db_url = os.environ.get('DATABASE_URL')
if db_url and '://' in db_url:
    protocol, rest = db_url.split('://', 1)
    if '+' in protocol:
        protocol = protocol.split('+')[0]
    db_url = f'{protocol}://{rest}'

attempts = 0
max_attempts = 30
while attempts < max_attempts:
    try:
        conn = psycopg2.connect(db_url, connect_timeout=5)
        conn.close()
        print('Database is ready!')
        sys.exit(0)
    except Exception:
        attempts += 1
        # Only print the error every few attempts to keep logs clean
        if attempts % 5 == 1:
            print(f'Waiting for database... ({attempts}/{max_attempts})')
        time.sleep(2)
sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "ERROR: Database did not become ready in time."
    exit 1
fi

# Run Alembic migrations
echo "Running database migrations..."
if ! alembic upgrade head; then
    echo "WARNING: Database migrations failed."
    echo "This frequently happens in local development when switching between branches"
    echo "where a migration revision exists in the database but not in the current codebase."

    if [ "$ENVIRONMENT" = "production" ]; then
        echo "ERROR: Refusing automatic Alembic recovery in production."
        echo "Manual migration repair is required."
        exit 1
    fi

    echo "Attempting local auto-recovery by resetting the Alembic version marker..."
    python -c "
import os
import sys
import psycopg2

db_url = os.environ.get('DATABASE_URL')
if db_url and '://' in db_url:
    protocol, rest = db_url.split('://', 1)
    if '+' in protocol:
        protocol = protocol.split('+')[0]
    db_url = f'{protocol}://{rest}'

try:
    conn = psycopg2.connect(db_url, connect_timeout=5)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute('DELETE FROM alembic_version')
    conn.close()
    print('Cleared Alembic version marker.')
except Exception as exc:
    print(f'ERROR: Failed to clear Alembic version marker: {exc}')
    sys.exit(1)
"

    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to reset Alembic version marker. Manual intervention required."
        exit 1
    fi

    echo "Stamping database to the current codebase head..."
    if alembic stamp head; then
        echo "Successfully stamped database to current head. Retrying migrations..."
        alembic upgrade head
    else
        echo "ERROR: Failed to stamp database to head. Manual intervention required."
        exit 1
    fi
fi

echo "Database setup complete!"

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
