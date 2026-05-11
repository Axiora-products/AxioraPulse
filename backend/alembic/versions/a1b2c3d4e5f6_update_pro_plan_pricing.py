"""update pro plan pricing

Revision ID: a1b2c3d4e5f6
Revises: 4f9a7b2c1d33
Create Date: 2026-05-11

Updates the Pro plan: price to ₹2,499 (249900 paise), unlimited surveys,
5 team member seats.
"""

from typing import Sequence, Union
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "4f9a7b2c1d33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE plans
        SET price_paise = 249900,
            max_surveys = NULL,
            max_team_members = 5
        WHERE code = 'pro'
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE plans
        SET price_paise = 99900,
            max_surveys = NULL,
            max_team_members = NULL
        WHERE code = 'pro'
    """)
