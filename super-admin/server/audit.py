import sys
import os
from sqlalchemy.orm import Session

# Add the main backend folder to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))
from db.models import AuditLog


def log_admin_action(
    db: Session,
    actor_user_id,
    actor_email: str,
    action: str,
    target_type: str = None,
    target_id: str = None,
    detail: dict = None,
    ip_address: str = None,
):
    """
    Appends a security audit entry to the audit_logs table.
    All state-changing operations in the super-admin console should call this.
    """
    try:
        log_entry = AuditLog(
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            detail=detail,
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        return log_entry
    except Exception as exc:
        # Don't let logging failures crash the primary request, but log them
        import logging

        logging.getLogger(__name__).error("Failed to write audit log: %s", str(exc))
        db.rollback()
        return None
