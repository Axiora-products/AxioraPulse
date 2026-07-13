"""add_collect_demographics_to_surveys

Revision ID: g1h2i3j4k5l6
Revises: c5d6e7f8a9b0, a1b2c3d4e5f7
Create Date: 2026-07-13 12:04:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, Sequence[str], None] = ("c5d6e7f8a9b0", "a1b2c3d4e5f7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "surveys",
        sa.Column("collect_demographics", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("surveys", "collect_demographics")
