"""add bulk_send_usage daily counter table

Tracks per-survey, per-channel (email | whatsapp) recipient volume for a single
calendar day (UTC). Bulk distribution daily limits are enforced against the
running ``recipient_count``; keying by ``usage_date`` means limits reset
automatically every 24h without a background job.

Revision ID: c5d6e7f8a9b0
Revises: b2c3d4e5f6a8
Create Date: 2026-06-24 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bulk_send_usage",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "survey_id",
            UUID(as_uuid=True),
            sa.ForeignKey("surveys.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("recipient_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "survey_id", "channel", "usage_date", name="uq_bulk_send_usage_survey_channel_date"
        ),
    )
    op.create_index(op.f("ix_bulk_send_usage_survey_id"), "bulk_send_usage", ["survey_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_bulk_send_usage_survey_id"), table_name="bulk_send_usage")
    op.drop_table("bulk_send_usage")
