"""add recommender artifacts

Revision ID: 20260530_0005
Revises: 20260422_0004
Create Date: 2026-05-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260530_0005"
down_revision = "20260422_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recommender_artifacts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_recommender_artifacts_kind", "recommender_artifacts", ["kind"])
    op.create_index("ix_recommender_artifacts_name", "recommender_artifacts", ["name"])
    op.create_index("ix_recommender_artifacts_is_current", "recommender_artifacts", ["is_current"])
    op.create_index("ix_recommender_artifacts_created_at", "recommender_artifacts", ["created_at"])
    op.create_index("ix_recommender_artifacts_promoted_at", "recommender_artifacts", ["promoted_at"])
    op.create_index("ix_recommender_artifacts_kind_current", "recommender_artifacts", ["kind", "is_current"])


def downgrade() -> None:
    op.drop_index("ix_recommender_artifacts_kind_current", table_name="recommender_artifacts")
    op.drop_index("ix_recommender_artifacts_promoted_at", table_name="recommender_artifacts")
    op.drop_index("ix_recommender_artifacts_created_at", table_name="recommender_artifacts")
    op.drop_index("ix_recommender_artifacts_is_current", table_name="recommender_artifacts")
    op.drop_index("ix_recommender_artifacts_name", table_name="recommender_artifacts")
    op.drop_index("ix_recommender_artifacts_kind", table_name="recommender_artifacts")
    op.drop_table("recommender_artifacts")
