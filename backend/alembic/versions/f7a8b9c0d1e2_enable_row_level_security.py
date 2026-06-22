"""enable Row-Level Security (tenant isolation, defense-in-depth)

Enables FORCE ROW LEVEL SECURITY with a tenant-isolation policy on every
tenant-scoped table. The policy is PERMISSIVE WHEN UNSET: if the app has not set
the `app.current_tenant` GUC (system/migration/public flows), all rows are
visible — so enabling this migration does not break anything. When the app sets
the GUC (see db/rls.py, gated by ENABLE_DB_RLS), Postgres constrains queries to
that tenant. `app.bypass_rls=on` lets super-admins see all tenants.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-06-22 00:30:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PERMISSIVE = (
    "coalesce(current_setting('app.bypass_rls', true), '') = 'on' "
    "OR coalesce(current_setting('app.current_tenant', true), '') = ''"
)

# table -> SQL expression that is TRUE when the row belongs to the current tenant.
_TENANT_MATCH = {
    "tenants": "id = current_setting('app.current_tenant', true)::uuid",
    "user_profiles": "tenant_id = current_setting('app.current_tenant', true)::uuid",
    "surveys": "tenant_id = current_setting('app.current_tenant', true)::uuid",
    "subscriptions": "tenant_id = current_setting('app.current_tenant', true)::uuid",
    "payments": "tenant_id = current_setting('app.current_tenant', true)::uuid",
    "uploaded_files": "tenant_id = current_setting('app.current_tenant', true)::uuid",
    "survey_questions": (
        "survey_id IN (SELECT id FROM surveys WHERE tenant_id = "
        "current_setting('app.current_tenant', true)::uuid)"
    ),
    "survey_responses": (
        "survey_id IN (SELECT id FROM surveys WHERE tenant_id = "
        "current_setting('app.current_tenant', true)::uuid)"
    ),
    "survey_feedback": (
        "survey_id IN (SELECT id FROM surveys WHERE tenant_id = "
        "current_setting('app.current_tenant', true)::uuid)"
    ),
    "survey_shares": (
        "survey_id IN (SELECT id FROM surveys WHERE tenant_id = "
        "current_setting('app.current_tenant', true)::uuid)"
    ),
    "survey_answers": (
        "response_id IN (SELECT id FROM survey_responses WHERE survey_id IN "
        "(SELECT id FROM surveys WHERE tenant_id = current_setting('app.current_tenant', true)::uuid))"
    ),
}


def upgrade() -> None:
    for table, match in _TENANT_MATCH.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({_PERMISSIVE} OR ({match})) "
            f"WITH CHECK ({_PERMISSIVE} OR ({match}))"
        )


def downgrade() -> None:
    for table in _TENANT_MATCH:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
