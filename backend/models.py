from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import Text, String, Integer, Float, Boolean, Index, DateTime, func, ForeignKey, UniqueConstraint


class Base(DeclarativeBase):
    pass




class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    track_links = relationship("TrackArtist", back_populates="artist", cascade="all, delete-orphan")


class Album(Base):
    __tablename__ = "albums"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(Text, index=True)
    release_date: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    label_name: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    tracks = relationship("CatalogTrack", back_populates="primary_album")
    external_refs = relationship("ExternalTrackRef", back_populates="album")


class Genre(Base):
    __tablename__ = "genres"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    track_links = relationship("TrackGenre", back_populates="genre", cascade="all, delete-orphan")


class CatalogTrack(Base):
    __tablename__ = "catalog_tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    canonical_title: Mapped[str] = mapped_column(Text, index=True)
    source_type: Mapped[str] = mapped_column(String(32), default="catalog", index=True)
    release_year: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    explicit: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_album_id: Mapped[str | None] = mapped_column(ForeignKey("albums.id", ondelete="SET NULL"), nullable=True, index=True)
    legacy_dataset_track_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    legacy_uploaded_track_id: Mapped[str | None] = mapped_column(String, nullable=True, unique=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )

    primary_album = relationship("Album", back_populates="tracks")
    artist_links = relationship(
        "TrackArtist",
        back_populates="track",
        cascade="all, delete-orphan",
        order_by="TrackArtist.position",
    )
    genre_links = relationship("TrackGenre", back_populates="track", cascade="all, delete-orphan")
    audio_features = relationship("AudioFeatures", back_populates="track", cascade="all, delete-orphan", uselist=False)
    audio_assets = relationship("AudioAsset", back_populates="track", cascade="all, delete-orphan")
    external_refs = relationship("ExternalTrackRef", back_populates="track", cascade="all, delete-orphan")


class TrackArtist(Base):
    __tablename__ = "track_artists"

    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("catalog_tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    artist_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("artists.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[str] = mapped_column(String(32), default="primary")
    position: Mapped[int] = mapped_column(Integer, default=0)

    track = relationship("CatalogTrack", back_populates="artist_links")
    artist = relationship("Artist", back_populates="track_links")


class TrackGenre(Base):
    __tablename__ = "track_genres"

    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("catalog_tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    genre_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("genres.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)

    track = relationship("CatalogTrack", back_populates="genre_links")
    genre = relationship("Genre", back_populates="track_links")


class AudioFeatures(Base):
    __tablename__ = "audio_features"

    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("catalog_tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    valence: Mapped[float | None] = mapped_column(Float, nullable=True)
    acousticness: Mapped[float | None] = mapped_column(Float, nullable=True)
    danceability: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy: Mapped[float | None] = mapped_column(Float, nullable=True)
    instrumentalness: Mapped[float | None] = mapped_column(Float, nullable=True)
    liveness: Mapped[float | None] = mapped_column(Float, nullable=True)
    loudness: Mapped[float | None] = mapped_column(Float, nullable=True)
    speechiness: Mapped[float | None] = mapped_column(Float, nullable=True)
    tempo: Mapped[float | None] = mapped_column(Float, nullable=True)
    key: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mode: Mapped[int | None] = mapped_column(Integer, nullable=True)
    popularity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feature_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[object] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        index=True,
    )

    track = relationship("CatalogTrack", back_populates="audio_features")


class AudioAsset(Base):
    __tablename__ = "audio_assets"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("catalog_tracks.id", ondelete="CASCADE"),
        index=True,
    )
    storage_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(128), default="audio/mpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    waveform_peaks_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_status: Mapped[str] = mapped_column(String(32), default="ready", index=True)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    kind: Mapped[str] = mapped_column(String(32), default="full", index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    track = relationship("CatalogTrack", back_populates="audio_assets")


class ExternalTrackRef(Base):
    __tablename__ = "external_track_refs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("catalog_tracks.id", ondelete="CASCADE"),
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), index=True)
    provider_track_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    provider_artist_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    provider_album_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    provider_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_uri: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    album_id: Mapped[str | None] = mapped_column(ForeignKey("albums.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    track = relationship("CatalogTrack", back_populates="external_refs")
    album = relationship("Album", back_populates="external_refs")

    __table_args__ = (
        UniqueConstraint("track_id", "provider", "provider_track_id", name="uq_external_track_ref_provider_track"),
    )


class CatalogSyncRun(Base):
    __tablename__ = "catalog_sync_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)
    query: Mapped[str | None] = mapped_column(Text, nullable=True)
    inserted_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    refs_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    finished_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    account_type: Mapped[str] = mapped_column(String(32), default="listener", index=True)
    password_hash: Mapped[str] = mapped_column(Text)
    locked_until: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    lock_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(Text, index=True)
    artists: Mapped[str] = mapped_column(Text, index=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    year: Mapped[int] = mapped_column(Integer, index=True)

    valence: Mapped[float] = mapped_column(Float)
    acousticness: Mapped[float] = mapped_column(Float)
    danceability: Mapped[float] = mapped_column(Float)
    duration_ms: Mapped[int] = mapped_column(Integer)
    energy: Mapped[float] = mapped_column(Float)
    explicit: Mapped[bool] = mapped_column(Boolean)
    instrumentalness: Mapped[float] = mapped_column(Float)
    key: Mapped[int] = mapped_column(Integer)
    liveness: Mapped[float] = mapped_column(Float)
    loudness: Mapped[float] = mapped_column(Float)
    mode: Mapped[int] = mapped_column(Integer)
    popularity: Mapped[int] = mapped_column(Integer)
    speechiness: Mapped[float] = mapped_column(Float)
    tempo: Mapped[float] = mapped_column(Float)


class Interaction(Base):
    """
    Anonymous interaction log (optional but recommended).
    This is your bridge toward Spotify-like personalization without requiring accounts.

    Frontend should send a stable `distinct_id` (e.g., uuid in localStorage).
    """
    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    distinct_id: Mapped[str] = mapped_column(String(128), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    track_id: Mapped[str] = mapped_column(String, index=True)
    artist_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("artists.id", ondelete="SET NULL"), nullable=True, index=True)
    genre_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("genres.id", ondelete="SET NULL"), nullable=True, index=True)
    event: Mapped[str] = mapped_column(String(32), index=True)  # like/dislike/play/open_spotify/etc.
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    play_position_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_page: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    context_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class TrackAudio(Base):
    """Optional full-audio attachment for an existing Track (dataset track).

    This is how you get *full song* playback without relying on Spotify previews.
    Users can upload audio files which we store on disk (or later: S3/R2).
    """

    __tablename__ = "track_audio"

    track_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("tracks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    file_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(128), default="audio/mpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class UploadedTrack(Base):
    """User-uploaded full-song tracks (independent of the dataset features).

    This enables Offtrack to behave like a real streaming product: users/artists upload
    audio, and Offtrack can stream it back.
    """

    __tablename__ = "uploaded_tracks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(Text, index=True)
    artist: Mapped[str] = mapped_column(Text, index=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    file_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(128), default="audio/mpeg")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    brand: Mapped[str] = mapped_column(String(32), default="card")
    last4: Mapped[str] = mapped_column(String(4))
    exp_month: Mapped[int] = mapped_column(Integer)
    exp_year: Mapped[int] = mapped_column(Integer)
    holder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class BillingReceipt(Base):
    __tablename__ = "billing_receipts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    status: Mapped[str] = mapped_column(String(32), default="paid")
    description: Mapped[str] = mapped_column(Text, default="Offtrack charge")
    payment_method_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    action: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class LyricReel(Base):
    """Generated short reel (MP4) from provided lyrics.

    MVP implementation stores generated files on disk (MEDIA_DIR/reels). In production,
    you likely want S3/R2 + signed URLs.
    """

    __tablename__ = "lyric_reels"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    prompt: Mapped[str] = mapped_column(Text)  # original lyrics or prompt
    file_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(64), default="video/mp4")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


Index("ix_tracks_name_artists", Track.name, Track.artists)
Index("ix_catalog_tracks_source_created", CatalogTrack.source_type, CatalogTrack.created_at)
Index("ix_track_artists_track_position", TrackArtist.track_id, TrackArtist.position)
Index("ix_audio_assets_track_kind_primary", AudioAsset.track_id, AudioAsset.kind, AudioAsset.is_primary)
Index("ix_interactions_distinct_track", Interaction.distinct_id, Interaction.track_id)
Index("ix_interactions_distinct_event_created", Interaction.distinct_id, Interaction.event, Interaction.created_at)
Index("ix_catalog_sync_runs_provider_started", CatalogSyncRun.provider, CatalogSyncRun.started_at)
Index("ix_track_audio_track_id", TrackAudio.track_id)
Index("ix_uploaded_tracks_title_artist", UploadedTrack.title, UploadedTrack.artist)
Index("ix_payment_methods_user_default", PaymentMethod.user_id, PaymentMethod.is_default)
Index("ix_billing_receipts_user_created", BillingReceipt.user_id, BillingReceipt.created_at)
Index("ix_security_audit_action_created", SecurityAuditLog.action, SecurityAuditLog.created_at)
