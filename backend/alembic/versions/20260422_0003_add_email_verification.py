"""add email verification state to users

Revision ID: 20260422_0003
Revises: 20260417_0002
Create Date: 2026-04-22 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260422_0003"
down_revision = "20260417_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_verification_token_hash", sa.String(length=128), nullable=True))
    op.add_column("users", sa.Column("email_verification_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_email_verified_at", "users", ["email_verified_at"], unique=False)
    op.create_index("ix_users_email_verification_token_hash", "users", ["email_verification_token_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_email_verification_token_hash", table_name="users")
    op.drop_index("ix_users_email_verified_at", table_name="users")
    op.drop_column("users", "email_verification_sent_at")
    op.drop_column("users", "email_verification_token_hash")
    op.drop_column("users", "email_verified_at")
