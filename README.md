# Offtrack

Offtrack is musician first: the product should help musicians get discovered,
understand their audience, and convert listener attention into durable fan
relationships.

- Product principles: [docs/product-principles.md](docs/product-principles.md)
- Competitive positioning: [docs/competitive-positioning.md](docs/competitive-positioning.md)
- Execution roadmap: [docs/execution-roadmap.md](docs/execution-roadmap.md)
- Recommender agent: [docs/recommender-agent.md](docs/recommender-agent.md)
- Deployment: [docs/deployment.md](docs/deployment.md)

## Dev (Docker, recommended)

1. Build + run:

```bash
docker compose up --build -d
```

The backend container waits for Postgres, runs Alembic migrations, and seeds the
catalog automatically. On later restarts it skips seeding when the catalog is
already ready.

2. Run backend tests:

```bash
docker compose run --rm backend python -m pytest tests/test_integration.py -q
```

3. Open:

- Frontend: http://localhost:8080
- Backend health: http://localhost:8000/api/ping
- DB status: http://localhost:8000/api/db_status

To force reseeding in Docker:

```bash
OFFTRACK_SEED_FORCE=true docker compose up --build
```

PowerShell:

```powershell
$env:OFFTRACK_SEED_FORCE = "true"
docker compose up --build
```

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

## Catalog Sync Providers

Catalog sync can enrich tracks from MusicBrainz, Last.fm, and Discogs. MusicBrainz and Discogs can run with an identifiable user agent; Last.fm requires an API key.

```bash
OFFTRACK_CONTACT_URL=https://your-site.example
MUSICBRAINZ_USER_AGENT="Offtrack/0.1 (https://your-site.example)"
LASTFM_API_KEY=...
LASTFM_USER_AGENT=Offtrack/0.1
DISCOGS_TOKEN=...
DISCOGS_USER_AGENT="Offtrack/0.1 +https://your-site.example"
```

Run a sync from the admin panel, or directly:

```bash
curl -X POST http://localhost:8000/api/admin/catalog/sync \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query":"indie pop","limit":10,"enrich":true}'
```

## Media Storage

Artist-uploaded audio uses local disk by default:

```bash
MEDIA_STORAGE_BACKEND=local
MEDIA_DIR=/app/media
```

For S3-compatible storage such as Cloudflare R2:

```bash
MEDIA_STORAGE_BACKEND=s3
S3_BUCKET=your-bucket
S3_KEY_PREFIX=offtrack
S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# Optional. If omitted, stream endpoints generate signed URLs.
S3_PUBLIC_BASE_URL=https://cdn.example.com
S3_SIGNED_URL_TTL_SEC=3600
```

The database stores remote audio paths as `s3://bucket/key`; playback endpoints redirect browsers to the public or signed media URL.
