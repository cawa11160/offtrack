from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260530_0006"
down_revision = "20260530_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("general_json", sa.Text(), nullable=True),
        sa.Column("audio_json", sa.Text(), nullable=True),
        sa.Column("notifications_json", sa.Text(), nullable=True),
        sa.Column("privacy_json", sa.Text(), nullable=True),
        sa.Column("artist_json", sa.Text(), nullable=True),
        sa.Column("conversion_links_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
    )
    op.create_index("ix_user_settings_updated", "user_settings", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_user_settings_updated", table_name="user_settings")
    op.drop_table("user_settings")
