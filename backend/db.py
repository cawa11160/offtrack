import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# SQLAlchemy URL format:
# postgresql+psycopg2://USER:PASSWORD@HOST:PORT/DBNAME
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/offtrack",
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
