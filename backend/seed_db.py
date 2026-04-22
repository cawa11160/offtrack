import os
from pathlib import Path
import hashlib
import pandas as pd
from sqlalchemy import inspect, text

from db import engine, DATABASE_URL, SessionLocal, wait_for_db
from catalog_sync import ensure_catalog_backfill
from models import Track, Interaction

HERE = Path(__file__).resolve().parent
DATA_CSV = HERE / "data" / "data.csv"

PG_MAX_PARAMS = 60000  # keep headroom under 65535


REQUIRED_COLS = [
    "id", "name", "artists", "image_url", "year",
    "valence", "acousticness", "danceability", "duration_ms", "energy",
    "explicit", "instrumentalness", "key", "liveness", "loudness", "mode",
    "popularity", "speechiness", "tempo",
]

# If your CSV uses different names, map them here:
RENAME_MAP = {
    "title": "name",
    "artist": "artists",
    "img": "image_url",
    "image": "image_url",
}

REQUIRED_MIGRATED_SCHEMA = {
    "tracks": {"id", "name", "artists"},
    "interactions": {
        "id",
        "track_id",
        "event",
        "user_id",
        "artist_id",
        "genre_id",
        "duration_ms",
        "play_position_ms",
        "source_page",
        "context_json",
    },
    "users": {"id", "email", "account_type"},
    "catalog_tracks": {"id", "canonical_title", "is_published", "owner_user_id"},
    "audio_features": {"track_id", "feature_source"},
    "audio_assets": {
        "id",
        "track_id",
        "duration_ms",
        "waveform_peaks_json",
        "processing_status",
        "processing_error",
    },
    "catalog_sync_runs": {"id", "provider", "status", "started_at", "finished_at"},
}


def stable_id(name: str, artists: str, year: int) -> str:
    s = f"{name}||{artists}||{year}"
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def env_truthy(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def table_count(conn, table_name: str) -> int:
    return int(conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one())


def seed_is_ready() -> bool:
    inspector = inspect(engine)
    required = {"tracks", "catalog_tracks", "audio_features"}
    existing = set(inspector.get_table_names())
    if not required.issubset(existing):
        return False

    with engine.connect() as conn:
        return (
            table_count(conn, "tracks") > 0
            and table_count(conn, "catalog_tracks") > 0
            and table_count(conn, "audio_features") > 0
        )


def validate_migrated_schema() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    missing_tables = sorted(set(REQUIRED_MIGRATED_SCHEMA) - existing_tables)
    if missing_tables:
        raise RuntimeError(
            "Database schema is not migrated. Missing tables: "
            + ", ".join(missing_tables)
            + ". Run `alembic -c alembic.ini upgrade head` before seeding."
        )

    missing_columns: list[str] = []
    for table_name, required_columns in REQUIRED_MIGRATED_SCHEMA.items():
        existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
        for column in sorted(required_columns - existing_columns):
            missing_columns.append(f"{table_name}.{column}")

    if missing_columns:
        raise RuntimeError(
            "Database schema is not migrated. Missing columns: "
            + ", ".join(missing_columns)
            + ". Run `alembic -c alembic.ini upgrade head` before seeding."
        )


def main():
    print("DATABASE_URL =", DATABASE_URL)
    print("CSV PATH =", DATA_CSV)

    if not DATA_CSV.exists():
        raise FileNotFoundError(f"CSV not found: {DATA_CSV}")

    wait_for_db(timeout_s=45)
    validate_migrated_schema()

    if env_truthy("OFFTRACK_SEED_SKIP_IF_READY") and not env_truthy("OFFTRACK_SEED_FORCE"):
        if seed_is_ready():
            print("Seed skipped: existing catalog is already ready.")
            return

    df = pd.read_csv(DATA_CSV)
    if len(df) == 0:
        raise RuntimeError("CSV loaded 0 rows — cannot seed.")
    print("Loaded rows:", len(df))

    # normalize columns
    df = df.rename(columns=RENAME_MAP)

    # ensure image_url exists
    if "image_url" not in df.columns:
        df["image_url"] = None

    # ensure required numeric fields exist (if CSV missing, default them)
    defaults = {
        "year": 0,
        "valence": 0.0,
        "acousticness": 0.0,
        "danceability": 0.0,
        "duration_ms": 0,
        "energy": 0.0,
        "explicit": False,
        "instrumentalness": 0.0,
        "key": 0,
        "liveness": 0.0,
        "loudness": 0.0,
        "mode": 0,
        "popularity": 0,
        "speechiness": 0.0,
        "tempo": 0.0,
        "name": "",
        "artists": "",
    }

    for k, v in defaults.items():
        if k not in df.columns:
            df[k] = v

    # create IDs if missing
    if "id" not in df.columns or df["id"].isna().all():
        df["id"] = [
            stable_id(str(n), str(a), int(y) if str(y).isdigit() else 0)
            for n, a, y in zip(df["name"], df["artists"], df["year"])
        ]

    # cast types robustly
    df["year"] = pd.to_numeric(
        df["year"], errors="coerce").fillna(0).astype(int)
    df["duration_ms"] = pd.to_numeric(
        df["duration_ms"], errors="coerce").fillna(0).astype(int)
    df["popularity"] = pd.to_numeric(
        df["popularity"], errors="coerce").fillna(0).astype(int)
    df["explicit"] = df["explicit"].fillna(False).astype(bool)

    float_cols = [
        "valence", "acousticness", "danceability", "energy",
        "instrumentalness", "liveness", "loudness", "speechiness", "tempo",
    ]
    for c in float_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0).astype(float)

    int_cols = ["key", "mode"]
    for c in int_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0).astype(int)

    # Keep only required columns (prevents accidental mismatch)
    df = df[[c for c in REQUIRED_COLS if c in df.columns]]

    # Create only tables required for recommendation seeding.
    # Avoid creating unrelated tables/indexes here; app startup handles full schema.
    Track.__table__.create(bind=engine, checkfirst=True)
    Interaction.__table__.create(bind=engine, checkfirst=True)

    dialect = getattr(engine.dialect, "name", "unknown")
    num_cols = len(df.columns)

    # Clear only recommender-related tables
    with engine.begin() as conn:
        if str(dialect).lower() == "postgresql":
            conn.execute(text("TRUNCATE TABLE interactions RESTART IDENTITY CASCADE"))
            conn.execute(text("TRUNCATE TABLE tracks RESTART IDENTITY CASCADE"))
        else:
            conn.execute(text("DELETE FROM interactions"))
            conn.execute(text("DELETE FROM tracks"))

    if str(dialect).lower() == "postgresql":
        safe_rows = max(1, PG_MAX_PARAMS // max(1, num_cols))
        chunksize = min(2000, safe_rows)
        method = "multi"
    else:
        chunksize = 1000
        method = None

    print(
        f"Seeding: dialect={dialect}, cols={num_cols}, chunksize={chunksize}, method={method}")

    total = len(df)
    for start in range(0, total, chunksize):
        end = min(start + chunksize, total)
        chunk = df.iloc[start:end]
        with engine.begin() as conn:
            kwargs = dict(
                name="tracks",
                con=conn,
                if_exists="append",
                index=False,
            )
            if method is not None:
                kwargs["method"] = method
            chunk.to_sql(**kwargs)
        print(f"Seeded tracks rows {start + 1}-{end} of {total}")

    with SessionLocal() as db:
        stats = ensure_catalog_backfill(db)
        print("Catalog sync:", stats)

    with engine.connect() as conn:
        legacy_cnt = int(conn.execute(text("SELECT COUNT(*) FROM tracks")).scalar_one())
        catalog_cnt = int(conn.execute(text("SELECT COUNT(*) FROM catalog_tracks")).scalar_one())
        features_cnt = int(conn.execute(text("SELECT COUNT(*) FROM audio_features")).scalar_one())
        print("Seed complete. tracks_count =", legacy_cnt)
        print("Catalog ready. catalog_tracks_count =", catalog_cnt, "audio_features_count =", features_cnt)


if __name__ == "__main__":
    main()
