"""add interactive question types

Revision ID: b8c9d0e1f2a3
Revises: d4e5f6a7b8c9
Create Date: 2026-05-15 12:00:00.000000
"""

from alembic import op


revision = "b8c9d0e1f2a3"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE questiontypeenum ADD VALUE IF NOT EXISTS 'emoji_reaction'")
    op.execute("ALTER TYPE questiontypeenum ADD VALUE IF NOT EXISTS 'swipe_choice'")
    op.execute("ALTER TYPE questiontypeenum ADD VALUE IF NOT EXISTS 'visual_choice'")


def downgrade():
    pass
