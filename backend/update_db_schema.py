from sqlalchemy import text
from db.database import engine

def apply_updates():
    print("Checking for missing columns in user_profiles...")
    
    # We'll use raw SQL to add columns if they don't exist
    # PostgreSQL doesn't have "ADD COLUMN IF NOT EXISTS" for older versions, 
    # but we can check existence in information_schema.
    
    commands = [
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invite_token VARCHAR(100) UNIQUE;",
        "ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMP WITH TIME ZONE;",
        "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS approved_domains TEXT[];"
    ]
    
    with engine.connect() as conn:
        for cmd in commands:
            try:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
                conn.commit()
                print("Success.")
            except Exception as e:
                print(f"Error or already exists: {e}")
                conn.rollback()

if __name__ == "__main__":
    apply_updates()
