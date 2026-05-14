"""add uploaded_files table

Revision ID: a1b2c3d4e5f6
Revises: e7da82edf568
Create Date: 2026-05-14

Adds the uploaded_files table for storing file/audio upload metadata
and extracted text content used for AI survey generation context.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e7da82edf568"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS uploaded_files (
            id             UUID PRIMARY KEY,
            filename       VARCHAR(500) NOT NULL,
            content_type   VARCHAR(100) NOT NULL,
            file_size      INTEGER,
            extracted_text TEXT,
            upload_type    VARCHAR(20) DEFAULT 'file',
            tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            created_by     UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
            created_at     TIMESTAMPTZ DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS ix_uploaded_files_tenant_id
            ON uploaded_files (tenant_id);
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_uploaded_files_tenant_id")
    op.drop_table("uploaded_files")
