from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Text, String, Integer, Float, Boolean, Index, DateTime, func


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


Index("ix_tracks_name_artists", Track.name, Track.artists)
Index("ix_interactions_distinct_track", Interaction.distinct_id, Interaction.track_id)
