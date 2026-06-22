"""
services/audit.py
─────────────────
Helper to append entries to the security audit trail. (AP-SEC-027)

Audit writes must never break the primary request: failures are swallowed and
logged, not raised.
"""

import logging
from typing import Optional

from sqlalchemy.orm import Session

from db.models import AuditLog

logger = logging.getLogger(__name__)


def record_audit(
    db: Session,
    *,
    action: str,
    actor=None,
    tenant_id=None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    """Append an audit entry. Best-effort: never raises."""
    try:
        entry = AuditLog(
            actor_user_id=getattr(actor, "id", None),
            actor_email=getattr(actor, "email", None),
            tenant_id=tenant_id if tenant_id is not None else getattr(actor, "tenant_id", None),
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            ip_address=ip_address,
            detail=detail,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:  # pragma: no cover - audit must not break the request
        logger.error("Failed to write audit log for action %s: %s", action, type(exc).__name__)
        try:
            db.rollback()
        except Exception:
            pass
