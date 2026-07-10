"""merge account_type/source and invited_by heads

Revision ID: merge_pulse_feat_001
Revises: a6f23d194e57, f2b3c4d5e6a7
Create Date: 2026-06-16 17:52:46.801113

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "merge_pulse_feat_001"
down_revision: Union[str, None] = ("a6f23d194e57", "f2b3c4d5e6a7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
