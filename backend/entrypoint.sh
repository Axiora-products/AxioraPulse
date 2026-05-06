#!/bin/bash

# Wait for database to be ready using Python
echo "Waiting for database..."
python -c "
import time
import psycopg2
while True:
    try:
        conn = psycopg2.connect('postgresql://postgres:root@db:5432/nexpulse')
        conn.close()
        break
    except:
        time.sleep(1)
"
echo "Database is ready!"

# Run database initialization
python init_db.py
python update_db_schema.py

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port 8000