"""add invited_by to user_profiles

Revision ID: 53db7b80b12b
Revises: 44a5f8225c87
Create Date: 2026-06-15 14:14:17.152376

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '53db7b80b12b'
down_revision: Union[str, None] = '44a5f8225c87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'user_profiles',
        sa.Column('invited_by', sa.UUID(), nullable=True)
    )

    op.create_index(
        op.f('ix_user_profiles_invited_by'),
        'user_profiles',
        ['invited_by'],
        unique=False
    )

    op.create_foreign_key(
        None,
        'user_profiles',
        'user_profiles',
        ['invited_by'],
        ['id']
    )

def downgrade() -> None:
    op.drop_constraint(
        None,
        'user_profiles',
        type_='foreignkey'
    )

    op.drop_index(
        op.f('ix_user_profiles_invited_by'),
        table_name='user_profiles'
    )

    op.drop_column(
        'user_profiles',
        'invited_by'
    )