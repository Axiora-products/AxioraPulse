"""add account_type to tenants

Revision ID: e1f2a3b4c5d6
Revises: f1a2b3c4d5e6
Create Date: 2026-06-16 10:00:00.000000

Adds a persisted account_type ('personal' | 'organization') to tenants so
Team Management can be disabled for personal accounts. Existing rows default
to 'organization' to preserve current behaviour.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("account_type", sa.String(length=20), nullable=False, server_default="organization"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "account_type")
