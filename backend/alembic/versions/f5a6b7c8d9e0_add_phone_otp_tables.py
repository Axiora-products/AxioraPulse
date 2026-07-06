"""add phone_number, phone_verified to user_profiles and otp_verifications table

Revision ID: f5a6b7c8d9e0
Revises: 5300ed5d1e11
Create Date: 2026-06-09

Adds phone_number (unique, indexed, nullable) and phone_verified columns
to user_profiles. Creates otp_verifications table for OTP login/link flows.
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "5300ed5d1e11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add phone columns to user_profiles
    op.execute("""
        ALTER TABLE user_profiles
            ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20) UNIQUE,
            ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;

        CREATE INDEX IF NOT EXISTS ix_user_profiles_phone_number
            ON user_profiles (phone_number);
    """)

    # Create otp_verifications table
    op.execute("""
        CREATE TABLE IF NOT EXISTS otp_verifications (
            id              UUID PRIMARY KEY,
            phone_number    VARCHAR(20) NOT NULL,
            otp_code        VARCHAR(6) NOT NULL,
            purpose         VARCHAR(20) NOT NULL,
            user_id         UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
            expires_at      TIMESTAMPTZ NOT NULL,
            verified        BOOLEAN DEFAULT FALSE,
            attempts        INTEGER DEFAULT 0,
            created_at      TIMESTAMPTZ DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS ix_otp_verifications_phone_number
            ON otp_verifications (phone_number);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_otp_verifications_phone_number")
    op.drop_table("otp_verifications")
    op.execute("DROP INDEX IF EXISTS ix_user_profiles_phone_number")
    op.execute("""
        ALTER TABLE user_profiles
            DROP COLUMN IF EXISTS phone_verified,
            DROP COLUMN IF EXISTS phone_number;
    """)
