import os
from pathlib import Path
import pandas as pd

from db import engine
from models import Base

HERE = Path(__file__).resolve().parent
DEFAULT_CSV = HERE / "data" / "data.csv"

def main():
    src = Path(os.getenv("SEED_CSV", str(DEFAULT_CSV))).resolve()
    if not src.exists():
        raise FileNotFoundError(f"Seed CSV not found: {src}")

    print(f"[seed_db] Loading: {src}")
    df = pd.read_csv(src)

    # Normalize types to match DB schema
    df["id"] = df["id"].astype(str)
    df["name"] = df["name"].astype(str)
    df["artists"] = df["artists"].astype(str)

    df["year"] = pd.to_numeric(df["year"], errors="coerce").fillna(0).astype(int)

    if "explicit" in df.columns:
        df["explicit"] = df["explicit"].astype(int).astype(bool)

    # Recreate tables (idempotent)
    print("[seed_db] Recreating schema...")
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    print(f"[seed_db] Inserting {len(df):,} rows into Postgres...")
    df.to_sql(
        "tracks",
        engine,
        if_exists="append",
        index=False,
        chunksize=10_000,
        method="multi",
    )
    print("[seed_db] Done.")

if __name__ == "__main__":
    main()
