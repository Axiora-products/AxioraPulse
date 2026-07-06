# ruff: noqa: F401
"""merge age_range and country_state heads

Revision ID: 7237b75f969b
Revises: 296048710623, b2c3d4e5f6a8
Create Date: 2026-07-06 12:18:26.064292

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7237b75f969b"
down_revision: Union[str, None] = ("296048710623", "b2c3d4e5f6a8")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
