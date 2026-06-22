"""
db/rls.py
─────────
Row-Level Security (RLS) plumbing — defense-in-depth tenant isolation enforced by
PostgreSQL itself, so an authorization slip in application code cannot leak another
tenant's rows.

How it works:
  - The RLS migration enables FORCE ROW LEVEL SECURITY with a policy that is
    PERMISSIVE WHEN UNSET: if the `app.current_tenant` GUC is not set, all rows are
    visible (so system/migration/public flows are unaffected). When the app sets
    the GUC to the authenticated tenant, the database constrains every query to
    that tenant.
  - Per request we set the GUC (transaction-local) from a contextvar populated by
    get_current_user. Super-admins set `app.bypass_rls=on` to see all tenants.

Gated by config.ENABLE_DB_RLS (default off) so it can be enabled and load-tested
in staging before production. Failure to set the GUC degrades to "no extra
constraint" (fail-open), never to an outage.
"""

import contextvars
import logging

from sqlalchemy import event, text

from core import config

logger = logging.getLogger(__name__)

_current_tenant: contextvars.ContextVar = contextvars.ContextVar("current_tenant", default=None)
_bypass_rls: contextvars.ContextVar = contextvars.ContextVar("bypass_rls", default=False)


def set_tenant_context(tenant_id) -> None:
    _current_tenant.set(str(tenant_id) if tenant_id else None)


def set_bypass_rls(on: bool = True) -> None:
    _bypass_rls.set(bool(on))


def clear_tenant_context() -> None:
    _current_tenant.set(None)
    _bypass_rls.set(False)


def apply_tenant_guc(db) -> None:
    """Set the tenant GUC on the CURRENT transaction immediately (in addition to
    the per-transaction listener), so queries in this request are constrained."""
    if not config.ENABLE_DB_RLS:
        return
    try:
        if _bypass_rls.get():
            db.execute(text("SELECT set_config('app.bypass_rls', 'on', true)"))
        tid = _current_tenant.get()
        if tid:
            db.execute(text("SELECT set_config('app.current_tenant', :t, true)"), {"t": tid})
    except Exception as exc:  # never break the request on a GUC failure
        logger.error("Failed to apply RLS tenant GUC: %s", type(exc).__name__)


def register_rls_listener(session_factory) -> None:
    """Re-apply the tenant GUC at the start of every transaction (covers queries
    that run after an intermediate commit)."""
    if not config.ENABLE_DB_RLS:
        return

    @event.listens_for(session_factory, "after_begin")
    def _set_guc(session, transaction, connection):  # noqa: ANN001
        try:
            if _bypass_rls.get():
                connection.exec_driver_sql("SELECT set_config('app.bypass_rls', 'on', true)")
            tid = _current_tenant.get()
            if tid:
                connection.exec_driver_sql(
                    "SELECT set_config('app.current_tenant', %s, true)", (tid,)
                )
        except Exception as exc:
            logger.error("RLS after_begin GUC failed: %s", type(exc).__name__)
