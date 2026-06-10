"""merge survey language and phone otp heads

Revision ID: 44a5f8225c87
Revises: 20d3d76d5811, f5a6b7c8d9e0
Create Date: 2026-06-10 15:52:16.131690

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "44a5f8225c87"
down_revision: Union[str, None] = ("20d3d76d5811", "f5a6b7c8d9e0")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
