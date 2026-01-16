import os
from pathlib import Path
import pandas as pd

try:
    from db import engine, DATABASE_URL
    from models import Base
except ImportError:
    from backend.db import engine, DATABASE_URL
    from backend.models import Base


HERE = Path(__file__).resolve().parent
DATA_CSV = HERE / "data" / "data.csv"


def main():
    print("DATABASE_URL =", DATABASE_URL)
    print("CSV PATH =", DATA_CSV)

    if not DATA_CSV.exists():
        raise FileNotFoundError(f"CSV not found: {DATA_CSV}")

    df = pd.read_csv(DATA_CSV)
    print("Loaded rows:", len(df))
    if len(df) == 0:
        raise RuntimeError("CSV loaded 0 rows — cannot seed.")

    # Create schema
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    # Ensure image_url exists even if CSV doesn't have it
    if "image_url" not in df.columns:
        df["image_url"] = ""

    # Seed
    df.to_sql("tracks", engine, if_exists="append",
              index=False, chunksize=5000, method="multi")
    print("Seed complete.")


if __name__ == "__main__":
    main()
