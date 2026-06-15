"""merge heads

Revision ID: a6f23d194e57
Revises: 53db7b80b12b, f1a2b3c4d5e6
Create Date: 2026-06-15 16:36:15.502379
"""

from typing import Sequence, Union

revision: str = "a6f23d194e57"
down_revision: Union[str, None] = (
    "53db7b80b12b",
    "f1a2b3c4d5e6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass