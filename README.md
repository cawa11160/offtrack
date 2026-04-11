# Offtrack

## Dev (Docker, recommended)

1. Build + run:

```bash
docker compose up --build -d
```

2. Run migrations:

```bash
docker compose run --rm backend alembic -c alembic.ini upgrade head
```

3. Seed Postgres:

```bash
docker compose run --rm backend python seed_db.py
```

4. Run backend tests:

```bash
docker compose run --rm backend python -m pytest tests/test_integration.py -q
```

5. Open:

- Frontend: http://localhost:8080
- Backend health: http://localhost:8000/api/ping
- DB status: http://localhost:8000/api/db_status

## Dev (Local, no Docker)

### Postgres

Create a DB named `offtrack` and set:

```bash
export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/offtrack"
```

Initialize:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Migrations:

```bash
cd backend
alembic -c alembic.ini upgrade head
```

Seed:

```bash
cd backend
python seed_db.py
```

Tests:

```bash
cd backend
python -m pytest tests/test_integration.py -q
```

### Backend

```bash
cd backend
source .venv/bin/activate
uvicorn api:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend proxies `/api/*` to the backend.

## Schema Notes

Offtrack now uses a normalized music catalog alongside legacy compatibility tables.

- Canonical catalog: `catalog_tracks`, `artists`, `track_artists`, `audio_features`, `audio_assets`, `albums`, `genres`, `track_genres`, `external_track_refs`
- Legacy compatibility: `tracks`, `uploaded_tracks`, `track_audio`

Current behavior:

- New uploads write to the canonical catalog.
- Seeded catalog data is backfilled into the canonical catalog during startup and `seed_db.py`.
- Search and recommendations read from the canonical catalog first, with legacy fallback only when needed.
- `/api/db_status` reports canonical catalog readiness via `catalog_ready`, `catalog_tracks_count`, and `audio_features_count`.

## Local Artifacts

These files can appear during local verification and are ignored by git:

- `backend/test_offtrack.sqlite3`
- `backend/migration_check.sqlite3`
- `backend/.pytest_cache/`
- `backend/pytest-cache-files-*`

## Analytics (PostHog, optional)

Set these env vars (backend):

- `POSTHOG_ENABLED=true`
- `POSTHOG_HOST=https://app.posthog.com` (or your self-hosted URL)
- `POSTHOG_API_KEY=...`

The backend will emit events for search/recommend/preview/open_spotify and you can also call `POST /api/feedback` for likes/dislikes.
