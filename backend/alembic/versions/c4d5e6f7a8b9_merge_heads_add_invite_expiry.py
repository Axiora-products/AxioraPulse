"""merge heads and add invite_expires_at to user_profiles

Merges the three open heads (a6f23d194e57, b8c9d0e1f2a3, a1b2c3d4e5f7) and adds
the invite_expires_at column used to expire pending invite tokens. (AP-SEC-016)

Revision ID: c4d5e6f7a8b9
Revises: a6f23d194e57, b8c9d0e1f2a3, a1b2c3d4e5f7
Create Date: 2026-06-22 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = (
    "a6f23d194e57",
    "b8c9d0e1f2a3",
    "a1b2c3d4e5f7",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_profiles",
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_profiles", "invite_expires_at")
