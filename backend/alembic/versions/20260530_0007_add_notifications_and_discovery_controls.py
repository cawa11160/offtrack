from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260530_0007"
down_revision = "20260530_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False, server_default="system"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("link", sa.Text(), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_type", "notifications", ["type"])
    op.create_index("ix_notifications_read_at", "notifications", ["read_at"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    op.create_index("ix_notifications_user_read_created", "notifications", ["user_id", "read_at", "created_at"])

    op.create_table(
        "upload_discovery_controls",
        sa.Column("track_id", sa.String(), sa.ForeignKey("catalog_tracks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("discovery_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_upload_discovery_controls_user_id", "upload_discovery_controls", ["user_id"])
    op.create_index("ix_upload_discovery_controls_discovery_paused", "upload_discovery_controls", ["discovery_paused"])
    op.create_index("ix_upload_discovery_controls_updated_at", "upload_discovery_controls", ["updated_at"])
    op.create_index(
        "ix_upload_discovery_controls_user_paused",
        "upload_discovery_controls",
        ["user_id", "discovery_paused"],
    )


def downgrade() -> None:
    op.drop_index("ix_upload_discovery_controls_user_paused", table_name="upload_discovery_controls")
    op.drop_index("ix_upload_discovery_controls_updated_at", table_name="upload_discovery_controls")
    op.drop_index("ix_upload_discovery_controls_discovery_paused", table_name="upload_discovery_controls")
    op.drop_index("ix_upload_discovery_controls_user_id", table_name="upload_discovery_controls")
    op.drop_table("upload_discovery_controls")

    op.drop_index("ix_notifications_user_read_created", table_name="notifications")
    op.drop_index("ix_notifications_created_at", table_name="notifications")
    op.drop_index("ix_notifications_read_at", table_name="notifications")
    op.drop_index("ix_notifications_type", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")
