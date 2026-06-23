"""widen survey_responses PII columns for field-level encryption

Encrypted (Fernet) values are longer than the plaintext, so the PII columns are
converted to TEXT. Existing plaintext values remain readable (the EncryptedString
type falls back to returning undecryptable values as-is during rollout).

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-22 00:20:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = ["respondent_email", "age_range", "gender", "occupation", "city"]


def upgrade() -> None:
    for col in _COLUMNS:
        op.alter_column("survey_responses", col, type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    # Best-effort revert to the original widths (will fail if encrypted ciphertext
    # exceeds the width — decrypt/migrate before downgrading).
    widths = {
        "respondent_email": 255,
        "age_range": 50,
        "gender": 50,
        "occupation": 100,
        "city": 100,
    }
    for col, w in widths.items():
        op.alter_column("survey_responses", col, type_=sa.String(length=w), existing_nullable=True)
