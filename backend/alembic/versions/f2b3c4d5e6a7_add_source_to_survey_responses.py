"""add source to survey_responses

Revision ID: f2b3c4d5e6a7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-16 12:00:00.000000

Adds a response-source (acquisition channel) column so respondent source can be
tracked per response (WhatsApp, LinkedIn, Email, QR Code, Direct Link, …) and
surfaced in source-wise analytics. Nullable; existing rows stay NULL (treated as
'direct' by the analytics layer).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f2b3c4d5e6a7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("survey_responses", sa.Column("source", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("survey_responses", "source")
