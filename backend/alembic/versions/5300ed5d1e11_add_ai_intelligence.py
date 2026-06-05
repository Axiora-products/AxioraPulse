"""add_ai_intelligence

Revision ID: 5300ed5d1e11
Revises: 8a7b6c5d4e3f
Create Date: 2026-05-21 08:59:55.064066

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "5300ed5d1e11"
down_revision: Union[str, None] = "8a7b6c5d4e3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("surveys", sa.Column("ai_intelligence", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column("surveys", "ai_intelligence")
