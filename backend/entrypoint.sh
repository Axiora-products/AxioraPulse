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

db_name = 'axiorapulse'
default_db_url = db_url
try:
    parts = db_url.rsplit('/', 1)
    if len(parts) == 2:
        base, db_name = parts
        default_db_url = f'{base}/postgres'
except Exception:
    pass

attempts = 0
max_attempts = 60
while attempts < max_attempts:
    try:
        conn = psycopg2.connect(db_url, connect_timeout=5)
        conn.close()
        print('Database is ready!')
        sys.exit(0)
    except psycopg2.OperationalError as exc:
        err_msg = str(exc)
        if 'does not exist' in err_msg:
            print(f'Database \"{db_name}\" does not exist. Attempting to auto-create it...')
            try:
                conn = psycopg2.connect(default_db_url, connect_timeout=5)
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(f'CREATE DATABASE {db_name};')
                conn.close()
                print(f'Database \"{db_name}\" created successfully!')
                continue
            except Exception as create_exc:
                print(f'Failed to auto-create database: {create_exc}')
        attempts += 1
        if attempts % 5 == 1:
            print(f'Waiting for database... ({attempts}/{max_attempts})')
        time.sleep(2)
    except Exception:
        attempts += 1
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
    echo "where the database schema no longer matches the current migration history."

    case "$ENVIRONMENT" in
        production|prod)
            echo "ERROR: Refusing automatic Alembic recovery in production."
            echo "Manual migration repair is required."
            exit 1
            ;;
    esac

    # Local auto-recovery: rebuild the schema from scratch so it always matches the
    # codebase, then migrate from base. We deliberately do NOT 'alembic stamp head'
    # here — stamping marks the DB as migrated WITHOUT applying any DDL, which
    # silently leaves the schema out of sync (e.g. columns from skipped migrations
    # never get created, surfacing later as UndefinedColumn 500s).
    echo "Local auto-recovery: dropping and rebuilding the database schema from scratch."
    echo "WARNING: this DESTROYS all data in this local database."
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
        cur.execute('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    conn.close()
    print('Schema dropped and recreated (empty).')
except Exception as exc:
    print(f'ERROR: Failed to rebuild schema: {exc}')
    sys.exit(1)
"

    if [ $? -ne 0 ]; then
        echo "ERROR: Failed to rebuild the database schema. Manual intervention required."
        exit 1
    fi

    echo "Re-running migrations from base..."
    if ! alembic upgrade head; then
        echo "ERROR: Migrations failed even after a clean schema rebuild. Manual intervention required."
        exit 1
    fi
    echo "Successfully rebuilt schema and applied all migrations."
fi

echo "Database setup complete!"

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
