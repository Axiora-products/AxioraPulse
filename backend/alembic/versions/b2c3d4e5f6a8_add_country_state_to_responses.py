"""add country and state to survey_responses demographics

Adds two PII columns (Text at rest, app-layer encrypted via EncryptedString) so a
respondent's location can be captured as a Country → State → City cascade. Both are
nullable; existing rows get NULL.

Revision ID: b2c3d4e5f6a8
Revises: f7a8b9c0d1e2
Create Date: 2026-06-23 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2c3d4e5f6a8"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("survey_responses", sa.Column("country", sa.Text(), nullable=True))
    op.add_column("survey_responses", sa.Column("state", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("survey_responses", "state")
    op.drop_column("survey_responses", "country")
