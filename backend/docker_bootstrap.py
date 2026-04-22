from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from db import engine, wait_for_db
from models import Base
from seed_db import validate_migrated_schema

HERE = Path(__file__).resolve().parent


def alembic_config() -> Config:
    cfg = Config(str(HERE / "alembic.ini"))
    cfg.set_main_option("script_location", str(HERE / "alembic"))
    return cfg


def stamp_existing_schema_if_needed() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "alembic_version" in tables:
        with engine.connect() as conn:
            version_rows = int(conn.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar_one())
        if version_rows > 0:
            return

    app_tables = set(Base.metadata.tables).intersection(tables)
    if not app_tables:
        Base.metadata.create_all(engine)
        command.stamp(alembic_config(), "head")
        print("Created fresh schema and stamped Alembic head.")
        return

    validate_migrated_schema()
    command.stamp(alembic_config(), "head")
    print("Stamped existing migrated schema at Alembic head.")


def main() -> None:
    wait_for_db(timeout_s=60)
    stamp_existing_schema_if_needed()


if __name__ == "__main__":
    main()
