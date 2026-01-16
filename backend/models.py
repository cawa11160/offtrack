from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Text, String, Integer, Float, Boolean, Index


class Base(DeclarativeBase):
    pass


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


# Helpful composite indexes for LIKE search
Index("ix_tracks_name_artists", Track.name, Track.artists)
