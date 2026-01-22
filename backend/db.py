import os
import time
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/offtrack",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def wait_for_db(timeout_s: int = 30) -> None:
    """
    In Docker, Postgres may not be ready immediately. This waits until it is.
    """
    deadline = time.time() + timeout_s
    last_err = None
    while time.time() < deadline:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                return
        except Exception as e:
            last_err = e
            time.sleep(1)
    raise RuntimeError(f"DB not ready after {timeout_s}s: {last_err}")
