from __future__ import annotations

import argparse
import json

from catalog_ingest import sync_current_catalog
from db import SessionLocal, wait_for_db
from models import Base
from db import engine


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync current music metadata into the Offtrack catalog.")
    parser.add_argument("--query", default="", help="Optional artist/track query. Empty uses provider trending sources.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of base tracks to ingest.")
    parser.add_argument("--no-enrich", action="store_true", help="Skip per-track enrichment calls.")
    args = parser.parse_args()

    wait_for_db(timeout_s=30)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        result = sync_current_catalog(db, query=args.query, limit=args.limit, enrich=not args.no_enrich)
        print(json.dumps(result, indent=2, default=str))
    finally:
        db.close()


if __name__ == "__main__":
    main()
