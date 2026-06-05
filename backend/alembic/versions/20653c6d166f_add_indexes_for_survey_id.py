"""add_indexes_for_survey_id

Revision ID: 20653c6d166f
Revises: c3d4e5f6a7b8
Create Date: 2026-05-19 15:56:45.395328

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20653c6d166f"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_survey_feedback_survey_id ON survey_feedback (survey_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_survey_questions_survey_id ON survey_questions (survey_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_survey_shares_survey_id ON survey_shares (survey_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_survey_shares_survey_id")
    op.execute("DROP INDEX IF EXISTS ix_survey_questions_survey_id")
    op.execute("DROP INDEX IF EXISTS ix_survey_feedback_survey_id")
