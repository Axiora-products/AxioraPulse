"""create bulk communication tables

Revision ID: 945369148502
Revises: b8c9d0e1f2a3
Create Date: 2026-05-18 18:06:21.236061

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '945369148502'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NOTE: bulk_campaigns and bulk_recipients are intentionally NOT created here.
    # They are created with the correct schema in the next migration: fc3edd03e227.

    # Helper: drop a constraint only if it actually exists (safe for fresh DBs)
    def safe_drop_constraint(name, table, type_):
        conn = op.get_bind()
        exists = conn.execute(sa.text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name = :n AND table_name = :t"
        ), {"n": name, "t": table}).fetchone()
        if exists:
            op.drop_constraint(name, table, type_=type_)

    # Helper: drop an index only if it exists
    def safe_drop_index(name, table_name):
        conn = op.get_bind()
        exists = conn.execute(sa.text(
            "SELECT 1 FROM pg_indexes WHERE indexname = :n"
        ), {"n": name}).fetchone()
        if exists:
            op.drop_index(name, table_name=table_name)

    safe_drop_constraint('uq_plans_code', 'plans', type_='unique')
    safe_drop_index('ix_plans_code', 'plans')
    op.create_index(op.f('ix_plans_code'), 'plans', ['code'], unique=True)

    safe_drop_constraint('uq_subscriptions_tenant_id', 'subscriptions', type_='unique')
    safe_drop_index('ix_subscriptions_tenant_id', 'subscriptions')
    op.create_index(op.f('ix_subscriptions_tenant_id'), 'subscriptions', ['tenant_id'], unique=True)

    safe_drop_constraint('tenants_slug_key', 'tenants', type_='unique')
    safe_drop_index('ix_tenants_slug', 'tenants')
    op.create_index(op.f('ix_tenants_slug'), 'tenants', ['slug'], unique=True)

    safe_drop_index('ix_uploaded_files_tenant_id', 'uploaded_files')

    safe_drop_constraint('user_profiles_email_key', 'user_profiles', type_='unique')
    safe_drop_index('ix_user_profiles_email', 'user_profiles')
    op.create_index(op.f('ix_user_profiles_email'), 'user_profiles', ['email'], unique=True)

    safe_drop_constraint('waitlist_entries_email_key', 'waitlist_entries', type_='unique')
    safe_drop_index('ix_waitlist_entries_email', 'waitlist_entries')
    op.create_index(op.f('ix_waitlist_entries_email'), 'waitlist_entries', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_waitlist_entries_email'), table_name='waitlist_entries')
    op.create_unique_constraint('waitlist_entries_email_key', 'waitlist_entries', ['email'])
    op.drop_index(op.f('ix_user_profiles_email'), table_name='user_profiles')
    op.create_unique_constraint('user_profiles_email_key', 'user_profiles', ['email'])
    op.drop_index(op.f('ix_tenants_slug'), table_name='tenants')
    op.create_unique_constraint('tenants_slug_key', 'tenants', ['slug'])
    op.drop_index(op.f('ix_subscriptions_tenant_id'), table_name='subscriptions')
    op.create_unique_constraint('uq_subscriptions_tenant_id', 'subscriptions', ['tenant_id'])
    op.drop_index(op.f('ix_plans_code'), table_name='plans')
    op.create_unique_constraint('uq_plans_code', 'plans', ['code'])
