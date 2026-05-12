"""add cognito_sub to user_profiles

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-12

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("cognito_sub", sa.String(255), nullable=True),
    )
    op.create_index("ix_user_profiles_cognito_sub", "user_profiles", ["cognito_sub"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_user_profiles_cognito_sub", table_name="user_profiles")
    op.drop_column("user_profiles", "cognito_sub")
