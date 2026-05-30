# Recommender Agent

Offtrack's recommender should stay musician first: independent musicians need
fair exposure, but listener trust decides whether that exposure becomes durable
fans.

The recommender agent is a background improvement system. It is not the
real-time recommender itself.

## Architecture

### Live recommender

The live recommender serves `/api/recommend`. It must stay fast and predictable.
It currently combines:

- seed-based audio similarity
- popularity controls for `all`, `indie`, and `mainstream` modes
- like, superlike, and dislike personalization
- diversity reranking
- artist-upload boosting
- reward scores generated from listener behavior

### Recommender agent

The agent runs out of band, either on a schedule or through an admin endpoint.
It reads interaction history and writes a versioned artifact that the live
recommender can consume safely.

Current artifact:

- path: `backend/artifacts/reward_scores.json`
- builder: `backend/recommender_agent.py`
- admin refresh: `POST /api/admin/recommender/reward-artifact`
- metrics: `GET /api/admin/recommender/metrics?days=7`
- offline evaluation: `GET /api/admin/recommender/evaluation?days=30`
- artifact list: `GET /api/admin/recommender/artifacts`
- rollback: `POST /api/admin/recommender/rollback`
- dataset export: `POST /api/admin/recommender/training-dataset`
- ranker training: `POST /api/admin/recommender/train-ranker`
- auth: `X-Admin-Api-Key`

The artifact contains per-track reward scores derived from:

- impressions
- plays
- 30-second plays
- completions
- saves
- likes and superlikes
- artist clicks and follows
- skips
- dislikes
- not-interested events

## Why This Is The Right Split

An agent should orchestrate improvement. It should not make every real-time
recommendation decision.

Request-time recommendations need low latency, consistent behavior, and easy
rollback. Background agent work can be slower, more experimental, and heavily
evaluated before promotion.

## Operating Loop

Hourly:

1. Read new impressions and feedback.
2. Recompute reward scores.
3. Apply musician-first exposure boost for published uploads.
4. Write `reward_scores.json`.
5. The live recommender blends the artifact with recent live feedback.

In Docker Compose this runs as the `recommender-agent` service. It uses:

```text
python recommender_agent.py loop
```

Set `RECOMMENDER_AGENT_INTERVAL_SECONDS` to change the loop interval. The
default is one hour.

Daily:

1. Review recommender metrics.
2. Compare completion, save, skip, artist-click, and upload-exposure rates.
3. Tune weights only when metrics justify it.
4. Keep a rollback copy of previous artifacts.

Later, when data volume is high enough:

1. Build an offline training dataset from impressions and outcomes.
2. Train a lightweight ranker such as LightGBM or XGBoost.
3. Evaluate against the current ranker.
4. Promote only if it improves musician-first and listener-quality metrics.

## Reward Objective

The production reward objective should optimize:

```text
 completed plays
+ saves / likes / superlikes
+ artist profile clicks
+ follows / conversion intent
+ healthy exposure for new musician uploads
- fast skips
- dislikes
- not interested
```

This keeps the system focused on real listener value while still giving new
musicians a route into discovery.

## Running The Agent

Local:

```bash
cd backend
python recommender_agent.py
python recommender_agent.py metrics --days 7
python recommender_agent.py evaluate --days 30
python recommender_agent.py dataset --days 90
python recommender_agent.py train --days 90
```

Admin API:

```bash
curl -X POST http://localhost:8000/api/admin/recommender/reward-artifact \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY"
```

Production scheduler:

```text
0 * * * * cd /app/backend && python recommender_agent.py
```

Docker Compose:

```bash
docker compose up -d recommender-agent
```

## Exploration Slots

The live recommender reserves a small number of slots for under-exposed
published musician uploads:

- `all` mode: 1 exploration slot
- `indie` mode: 2 exploration slots

Exploration candidates are sorted toward lower impression counts first. They
still need a playable uploaded audio asset, so listener trust is protected.

## Artifact Versioning And Rollback

Each reward build writes:

- current artifact: `reward_scores.json`
- previous artifact: `reward_scores.previous.json`
- timestamped artifact: `reward_scores.<timestamp>.json`

The admin recommender dashboard can restore any non-current artifact. The API
also supports rollback:

```bash
curl -X POST http://localhost:8000/api/admin/recommender/rollback \
  -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"reward_scores.previous.json"}'
```

## Training Dataset And Ranker

The first training layer is deliberately lightweight. It exports impression rows
and outcomes into JSONL, then trains a track-prior ranker artifact. This is not
the final ML model, but it gives production a safe trained-artifact interface.

Generated files:

- `training_dataset.jsonl`
- `ranker_scores.json`

The live recommender blends ranker scores with reward scores when the ranker
artifact exists.

Admin dashboard:

- route: `/admin/recommender`
- shows metrics, evaluation, artifacts, rollback, dataset export, and ranker
  training controls

## When To Train A Model

Do not train a model before the data loop is healthy. The first production
stage is automated reward scoring plus exploration. Train a model when there
are enough impressions and outcomes to evaluate it honestly.

Minimum useful data:

- thousands of recommendation impressions
- enough skips and completions to separate good from bad matches
- repeated listener sessions
- meaningful uploaded-track exposure

Recommended first model:

- gradient-boosted ranker
- trained on impression rows
- target from weighted listener outcomes
- features from listener history, track metadata, audio features, upload
  freshness, reward score, and rank context

Deep learning should wait until Offtrack has enough traffic to justify it.
