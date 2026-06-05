"""merge heads

Revision ID: 8a7b6c5d4e3f
Revises: 20653c6d166f, fc3edd03e227
Create Date: 2026-05-19 15:00:00.000000

"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "8a7b6c5d4e3f"
down_revision: Union[str, None] = ("20653c6d166f", "fc3edd03e227")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
