"""add catalog sync runs and richer interactions

Revision ID: 20260417_0002
Revises: 20260410_0001
Create Date: 2026-04-17 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260417_0002"
down_revision = "20260410_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalog_sync_runs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'running'")),
        sa.Column("query", sa.Text(), nullable=True),
        sa.Column("inserted_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("refs_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_catalog_sync_runs_provider", "catalog_sync_runs", ["provider"], unique=False)
    op.create_index("ix_catalog_sync_runs_status", "catalog_sync_runs", ["status"], unique=False)
    op.create_index("ix_catalog_sync_runs_started_at", "catalog_sync_runs", ["started_at"], unique=False)
    op.create_index("ix_catalog_sync_runs_finished_at", "catalog_sync_runs", ["finished_at"], unique=False)
    op.create_index(
        "ix_catalog_sync_runs_provider_started",
        "catalog_sync_runs",
        ["provider", "started_at"],
        unique=False,
    )

    op.add_column("interactions", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("interactions", sa.Column("artist_id", sa.Integer(), nullable=True))
    op.add_column("interactions", sa.Column("genre_id", sa.Integer(), nullable=True))
    op.add_column("interactions", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("interactions", sa.Column("play_position_ms", sa.Integer(), nullable=True))
    op.add_column("interactions", sa.Column("source_page", sa.String(length=128), nullable=True))
    op.add_column("interactions", sa.Column("context_json", sa.Text(), nullable=True))
    op.create_index("ix_interactions_user_id", "interactions", ["user_id"], unique=False)
    op.create_index("ix_interactions_artist_id", "interactions", ["artist_id"], unique=False)
    op.create_index("ix_interactions_genre_id", "interactions", ["genre_id"], unique=False)
    op.create_index("ix_interactions_source_page", "interactions", ["source_page"], unique=False)
    op.create_index(
        "ix_interactions_distinct_event_created",
        "interactions",
        ["distinct_id", "event", "created_at"],
        unique=False,
    )

    op.add_column("catalog_tracks", sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("catalog_tracks", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_index("ix_catalog_tracks_is_published", "catalog_tracks", ["is_published"], unique=False)
    op.create_index("ix_catalog_tracks_owner_user_id", "catalog_tracks", ["owner_user_id"], unique=False)

    op.add_column("users", sa.Column("account_type", sa.String(length=32), nullable=False, server_default=sa.text("'listener'")))
    op.create_index("ix_users_account_type", "users", ["account_type"], unique=False)

    op.add_column("audio_assets", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.add_column("audio_assets", sa.Column("waveform_peaks_json", sa.Text(), nullable=True))
    op.add_column("audio_assets", sa.Column("processing_status", sa.String(length=32), nullable=False, server_default=sa.text("'ready'")))
    op.add_column("audio_assets", sa.Column("processing_error", sa.Text(), nullable=True))
    op.create_index("ix_audio_assets_processing_status", "audio_assets", ["processing_status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_interactions_distinct_event_created", table_name="interactions")
    op.drop_index("ix_interactions_source_page", table_name="interactions")
    op.drop_index("ix_interactions_genre_id", table_name="interactions")
    op.drop_index("ix_interactions_artist_id", table_name="interactions")
    op.drop_index("ix_interactions_user_id", table_name="interactions")
    op.drop_column("interactions", "context_json")
    op.drop_column("interactions", "source_page")
    op.drop_column("interactions", "play_position_ms")
    op.drop_column("interactions", "duration_ms")
    op.drop_column("interactions", "genre_id")
    op.drop_column("interactions", "artist_id")
    op.drop_column("interactions", "user_id")

    op.drop_index("ix_catalog_tracks_owner_user_id", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_is_published", table_name="catalog_tracks")
    op.drop_column("catalog_tracks", "owner_user_id")
    op.drop_column("catalog_tracks", "is_published")

    op.drop_index("ix_users_account_type", table_name="users")
    op.drop_column("users", "account_type")

    op.drop_index("ix_audio_assets_processing_status", table_name="audio_assets")
    op.drop_column("audio_assets", "processing_error")
    op.drop_column("audio_assets", "processing_status")
    op.drop_column("audio_assets", "waveform_peaks_json")
    op.drop_column("audio_assets", "duration_ms")

    op.drop_index("ix_catalog_sync_runs_provider_started", table_name="catalog_sync_runs")
    op.drop_index("ix_catalog_sync_runs_finished_at", table_name="catalog_sync_runs")
    op.drop_index("ix_catalog_sync_runs_started_at", table_name="catalog_sync_runs")
    op.drop_index("ix_catalog_sync_runs_status", table_name="catalog_sync_runs")
    op.drop_index("ix_catalog_sync_runs_provider", table_name="catalog_sync_runs")
    op.drop_table("catalog_sync_runs")
