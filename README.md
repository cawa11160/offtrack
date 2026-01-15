# Offtrack

## Dev (Docker, recommended)

1. Build + run:

```bash
docker compose up --build
```

2. Seed Postgres (first time only):

```bash
docker compose exec backend python seed_db.py
```

3. Open:

- Frontend: http://localhost:8080
- Backend health: http://localhost:8000/api/ping

## Dev (Local, no Docker)

### Postgres

Create a DB named `offtrack` and set:

```bash
export DATABASE_URL="postgresql+psycopg2://postgres:postgres@localhost:5432/offtrack"
```

Seed:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python seed_db.py
```

### Backend

```bash
cd backend
source .venv/bin/activate
uvicorn api:app --reload --port 8000
```

### Frontend

```bash
cd frontend/website-main
npm install
npm run dev
```

Frontend proxies `/api/*` to the backend.
