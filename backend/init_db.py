"""
init_db.py
──────────
Creates all database tables from the SQLAlchemy ORM models.
Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS semantics.

Usage:
  python init_db.py
"""

import sys
import os

# Make sure imports resolve from the backend root
sys.path.insert(0, os.path.dirname(__file__))

from db.database import engine, Base

# Import ALL models so SQLAlchemy registers them before create_all()
from db.models import (
    Tenant,
    UserProfile,
    Survey,
    SurveyQuestion,
    SurveyResponse,
    SurveyAnswer,
    SurveyFeedback,
)

def init():
    print("Connecting to:", engine.url)
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print()
    print("OK  Tables created (or already exist):")
    for table in Base.metadata.sorted_tables:
        print(f"   - {table.name}")
    print()
    print("Done. Run 'python update_db_schema.py' to apply any column patches.")

if __name__ == "__main__":
    init()
