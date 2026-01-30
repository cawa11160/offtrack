import os
from pathlib import Path
import hashlib
import pandas as pd
from sqlalchemy import text

from db import engine, DATABASE_URL, wait_for_db
from models import Base

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


def stable_id(name: str, artists: str, year: int) -> str:
    s = f"{name}||{artists}||{year}"
    return hashlib.md5(s.encode("utf-8")).hexdigest()


def main():
    print("DATABASE_URL =", DATABASE_URL)
    print("CSV PATH =", DATA_CSV)

    if not DATA_CSV.exists():
        raise FileNotFoundError(f"CSV not found: {DATA_CSV}")

    wait_for_db(timeout_s=45)

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

    # Create schema (do NOT drop all tables; preserve users)
    Base.metadata.create_all(engine)

    # Clear only recommender-related tables
    with engine.begin() as conn:
        conn.execute(text('TRUNCATE TABLE interactions RESTART IDENTITY CASCADE'))
        conn.execute(text('TRUNCATE TABLE tracks RESTART IDENTITY CASCADE'))

    dialect = getattr(engine.dialect, "name", "unknown")
    num_cols = len(df.columns)

    if str(dialect).lower() == "postgresql":
        safe_rows = max(1, PG_MAX_PARAMS // max(1, num_cols))
        chunksize = min(2000, safe_rows)
        method = "multi"
    else:
        chunksize = 1000
        method = None

    print(
        f"Seeding: dialect={dialect}, cols={num_cols}, chunksize={chunksize}, method={method}")

    kwargs = dict(
        name="tracks",
        con=engine,
        if_exists="append",
        index=False,
        chunksize=chunksize,
    )
    if method is not None:
        kwargs["method"] = method

    df.to_sql(**kwargs)

    with engine.connect() as conn:
        cnt = conn.execute(text("SELECT COUNT(*) FROM tracks")).scalar_one()
        print("Seed complete. tracks_count =", int(cnt))


if __name__ == "__main__":
    main()
