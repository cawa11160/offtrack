"""add normalized catalog tables

Revision ID: 20260410_0001
Revises:
Create Date: 2026-04-10 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260410_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_artists_name", "artists", ["name"], unique=False)
    op.create_index("ix_artists_created_at", "artists", ["created_at"], unique=False)

    op.create_table(
        "albums",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("release_date", sa.String(length=32), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("label_name", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_albums_title", "albums", ["title"], unique=False)
    op.create_index("ix_albums_release_date", "albums", ["release_date"], unique=False)
    op.create_index("ix_albums_label_name", "albums", ["label_name"], unique=False)
    op.create_index("ix_albums_created_at", "albums", ["created_at"], unique=False)

    op.create_table(
        "genres",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_genres_name", "genres", ["name"], unique=False)
    op.create_index("ix_genres_created_at", "genres", ["created_at"], unique=False)

    op.create_table(
        "catalog_tracks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("canonical_title", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default=sa.text("'catalog'")),
        sa.Column("release_year", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("explicit", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("primary_album_id", sa.String(), nullable=True),
        sa.Column("legacy_dataset_track_id", sa.String(), nullable=True),
        sa.Column("legacy_uploaded_track_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["primary_album_id"], ["albums.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("legacy_dataset_track_id"),
        sa.UniqueConstraint("legacy_uploaded_track_id"),
    )
    op.create_index("ix_catalog_tracks_canonical_title", "catalog_tracks", ["canonical_title"], unique=False)
    op.create_index("ix_catalog_tracks_source_type", "catalog_tracks", ["source_type"], unique=False)
    op.create_index("ix_catalog_tracks_release_year", "catalog_tracks", ["release_year"], unique=False)
    op.create_index("ix_catalog_tracks_primary_album_id", "catalog_tracks", ["primary_album_id"], unique=False)
    op.create_index("ix_catalog_tracks_legacy_dataset_track_id", "catalog_tracks", ["legacy_dataset_track_id"], unique=False)
    op.create_index("ix_catalog_tracks_legacy_uploaded_track_id", "catalog_tracks", ["legacy_uploaded_track_id"], unique=False)
    op.create_index("ix_catalog_tracks_created_at", "catalog_tracks", ["created_at"], unique=False)
    op.create_index("ix_catalog_tracks_updated_at", "catalog_tracks", ["updated_at"], unique=False)
    op.create_index("ix_catalog_tracks_source_created", "catalog_tracks", ["source_type", "created_at"], unique=False)

    op.create_table(
        "track_artists",
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("artist_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default=sa.text("'primary'")),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.ForeignKeyConstraint(["artist_id"], ["artists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["catalog_tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("track_id", "artist_id"),
    )
    op.create_index("ix_track_artists_track_position", "track_artists", ["track_id", "position"], unique=False)

    op.create_table(
        "track_genres",
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("genre_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["genre_id"], ["genres.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["catalog_tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("track_id", "genre_id"),
    )

    op.create_table(
        "audio_features",
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("valence", sa.Float(), nullable=True),
        sa.Column("acousticness", sa.Float(), nullable=True),
        sa.Column("danceability", sa.Float(), nullable=True),
        sa.Column("energy", sa.Float(), nullable=True),
        sa.Column("instrumentalness", sa.Float(), nullable=True),
        sa.Column("liveness", sa.Float(), nullable=True),
        sa.Column("loudness", sa.Float(), nullable=True),
        sa.Column("speechiness", sa.Float(), nullable=True),
        sa.Column("tempo", sa.Float(), nullable=True),
        sa.Column("key", sa.Integer(), nullable=True),
        sa.Column("mode", sa.Integer(), nullable=True),
        sa.Column("popularity", sa.Integer(), nullable=True),
        sa.Column("feature_source", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["track_id"], ["catalog_tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("track_id"),
    )
    op.create_index("ix_audio_features_created_at", "audio_features", ["created_at"], unique=False)
    op.create_index("ix_audio_features_updated_at", "audio_features", ["updated_at"], unique=False)

    op.create_table(
        "audio_assets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False, server_default=sa.text("'audio/mpeg'")),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default=sa.text("'full'")),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["track_id"], ["catalog_tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audio_assets_track_id", "audio_assets", ["track_id"], unique=False)
    op.create_index("ix_audio_assets_kind", "audio_assets", ["kind"], unique=False)
    op.create_index("ix_audio_assets_is_primary", "audio_assets", ["is_primary"], unique=False)
    op.create_index("ix_audio_assets_created_at", "audio_assets", ["created_at"], unique=False)
    op.create_index("ix_audio_assets_track_kind_primary", "audio_assets", ["track_id", "kind", "is_primary"], unique=False)

    op.create_table(
        "external_track_refs",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("track_id", sa.String(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_track_id", sa.String(length=255), nullable=True),
        sa.Column("provider_artist_id", sa.String(length=255), nullable=True),
        sa.Column("provider_album_id", sa.String(length=255), nullable=True),
        sa.Column("provider_url", sa.Text(), nullable=True),
        sa.Column("provider_uri", sa.Text(), nullable=True),
        sa.Column("preview_url", sa.Text(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("album_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["track_id"], ["catalog_tracks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("track_id", "provider", "provider_track_id", name="uq_external_track_ref_provider_track"),
    )
    op.create_index("ix_external_track_refs_track_id", "external_track_refs", ["track_id"], unique=False)
    op.create_index("ix_external_track_refs_provider", "external_track_refs", ["provider"], unique=False)
    op.create_index("ix_external_track_refs_provider_track_id", "external_track_refs", ["provider_track_id"], unique=False)
    op.create_index("ix_external_track_refs_provider_artist_id", "external_track_refs", ["provider_artist_id"], unique=False)
    op.create_index("ix_external_track_refs_provider_album_id", "external_track_refs", ["provider_album_id"], unique=False)
    op.create_index("ix_external_track_refs_album_id", "external_track_refs", ["album_id"], unique=False)
    op.create_index("ix_external_track_refs_created_at", "external_track_refs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_external_track_refs_created_at", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_album_id", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_provider_album_id", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_provider_artist_id", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_provider_track_id", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_provider", table_name="external_track_refs")
    op.drop_index("ix_external_track_refs_track_id", table_name="external_track_refs")
    op.drop_table("external_track_refs")

    op.drop_index("ix_audio_assets_track_kind_primary", table_name="audio_assets")
    op.drop_index("ix_audio_assets_created_at", table_name="audio_assets")
    op.drop_index("ix_audio_assets_is_primary", table_name="audio_assets")
    op.drop_index("ix_audio_assets_kind", table_name="audio_assets")
    op.drop_index("ix_audio_assets_track_id", table_name="audio_assets")
    op.drop_table("audio_assets")

    op.drop_index("ix_audio_features_updated_at", table_name="audio_features")
    op.drop_index("ix_audio_features_created_at", table_name="audio_features")
    op.drop_table("audio_features")

    op.drop_table("track_genres")

    op.drop_index("ix_track_artists_track_position", table_name="track_artists")
    op.drop_table("track_artists")

    op.drop_index("ix_catalog_tracks_source_created", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_updated_at", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_created_at", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_legacy_uploaded_track_id", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_legacy_dataset_track_id", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_primary_album_id", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_release_year", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_source_type", table_name="catalog_tracks")
    op.drop_index("ix_catalog_tracks_canonical_title", table_name="catalog_tracks")
    op.drop_table("catalog_tracks")

    op.drop_index("ix_genres_created_at", table_name="genres")
    op.drop_index("ix_genres_name", table_name="genres")
    op.drop_table("genres")

    op.drop_index("ix_albums_created_at", table_name="albums")
    op.drop_index("ix_albums_label_name", table_name="albums")
    op.drop_index("ix_albums_release_date", table_name="albums")
    op.drop_index("ix_albums_title", table_name="albums")
    op.drop_table("albums")

    op.drop_index("ix_artists_created_at", table_name="artists")
    op.drop_index("ix_artists_name", table_name="artists")
    op.drop_table("artists")
