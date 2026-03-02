from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Text, String, Integer, Float, Boolean, Index, DateTime, func, ForeignKey


class Base(DeclarativeBase):
    pass




class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(Text)
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
    track_id: Mapped[str] = mapped_column(String, index=True)
    event: Mapped[str] = mapped_column(String(32), index=True)  # like/dislike/play/open_spotify/etc.
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
Index("ix_interactions_distinct_track", Interaction.distinct_id, Interaction.track_id)
Index("ix_track_audio_track_id", TrackAudio.track_id)
Index("ix_uploaded_tracks_title_artist", UploadedTrack.title, UploadedTrack.artist)
