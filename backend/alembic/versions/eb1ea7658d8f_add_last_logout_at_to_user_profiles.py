"""add_last_logout_at_to_user_profiles

Revision ID: eb1ea7658d8f
Revises: c3d4e5f6a7b8
Create Date: 2026-05-16 21:22:43.754197

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eb1ea7658d8f"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_profiles", sa.Column("last_logout_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "last_logout_at")
