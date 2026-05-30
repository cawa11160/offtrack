from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, selectinload

from db import SessionLocal
from models import AudioFeatures, CatalogTrack, Interaction


HERE = Path(__file__).resolve().parent
DEFAULT_ARTIFACT_PATH = HERE / "artifacts" / "reward_scores.json"
DEFAULT_DATASET_PATH = HERE / "artifacts" / "training_dataset.jsonl"
DEFAULT_RANKER_PATH = HERE / "artifacts" / "ranker_scores.json"
ARTIFACT_VERSION = 1

EVENT_WEIGHTS: Dict[str, float] = {
    "impression": 0.0,
    "superlike": 6.0,
    "save": 5.0,
    "follow_artist": 4.5,
    "replay": 4.5,
    "like": 4.0,
    "play_complete": 4.0,
    "play_30s": 3.0,
    "upload_play": 3.0,
    "play": 2.0,
    "play_start": 1.5,
    "click_recommendation": 1.5,
    "open_spotify": 1.0,
    "artist_click": 1.0,
    "genre_click": 1.0,
    "share": 1.0,
    "skip": -1.5,
    "dislike": -2.0,
    "not_interested": -4.0,
}

POSITIVE_EVENTS = {
    "superlike",
    "save",
    "follow_artist",
    "replay",
    "like",
    "play_complete",
    "play_30s",
    "upload_play",
    "play",
    "click_recommendation",
    "open_spotify",
    "artist_click",
    "share",
}
NEGATIVE_EVENTS = {"skip", "dislike", "not_interested"}


def artifact_path() -> Path:
    return Path(os.getenv("RECOMMENDER_REWARD_ARTIFACT", str(DEFAULT_ARTIFACT_PATH))).resolve()


def dataset_path() -> Path:
    return Path(os.getenv("RECOMMENDER_TRAINING_DATASET", str(DEFAULT_DATASET_PATH))).resolve()


def ranker_artifact_path() -> Path:
    return Path(os.getenv("RECOMMENDER_RANKER_ARTIFACT", str(DEFAULT_RANKER_PATH))).resolve()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _artifact_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _confidence(signal_count: int, impressions: int) -> float:
    total = max(0, int(signal_count)) + max(0, int(impressions))
    return min(1.0, total / 50.0)


def _normalized_reward(raw_score: float, signal_count: int, impressions: int) -> float:
    exposure = max(1.0, float(impressions or 0) ** 0.5)
    evidence = max(1.0, float(signal_count or 0) ** 0.5)
    return max(-1.0, min(1.0, float(raw_score) / (8.0 + exposure + evidence)))


def compute_reward_artifact(db: Session) -> Dict[str, Any]:
    rows = (
        db.query(Interaction.track_id, Interaction.event, func.count(Interaction.id))
        .filter(Interaction.event.in_(set(EVENT_WEIGHTS)))
        .group_by(Interaction.track_id, Interaction.event)
        .all()
    )

    by_track: Dict[str, Dict[str, Any]] = {}
    for track_id, event, count in rows:
        tid = (track_id or "").strip()
        ev = (event or "").strip().lower()
        if not tid or ev not in EVENT_WEIGHTS:
            continue

        row = by_track.setdefault(
            tid,
            {
                "rawScore": 0.0,
                "score": 0.0,
                "impressions": 0,
                "positiveSignals": 0,
                "negativeSignals": 0,
                "signalCount": 0,
                "confidence": 0.0,
                "musicianFirstBoost": 0.0,
            },
        )
        c = int(count or 0)
        if ev == "impression":
            row["impressions"] += c
        else:
            row["rawScore"] += EVENT_WEIGHTS[ev] * c
            row["signalCount"] += c
            if ev in POSITIVE_EVENTS:
                row["positiveSignals"] += c
            elif ev in NEGATIVE_EVENTS:
                row["negativeSignals"] += c

    try:
        upload_ids = {
            track_id
            for (track_id,) in db.query(CatalogTrack.id)
            .filter(CatalogTrack.source_type == "upload", CatalogTrack.is_published.is_(True))
            .all()
            if track_id
        }
    except SQLAlchemyError:
        upload_ids = set()

    for tid, row in by_track.items():
        confidence = _confidence(row["signalCount"], row["impressions"])
        musician_boost = 0.12 if tid in upload_ids else 0.0
        reward = _normalized_reward(row["rawScore"], row["signalCount"], row["impressions"])
        row["confidence"] = round(confidence, 4)
        row["musicianFirstBoost"] = musician_boost
        row["score"] = round(max(-1.0, min(1.0, reward * (0.55 + 0.45 * confidence) + musician_boost)), 6)

    return {
        "version": ARTIFACT_VERSION,
        "generatedAt": _now_iso(),
        "trackCount": len(by_track),
        "eventWeights": EVENT_WEIGHTS,
        "tracks": by_track,
    }


def write_reward_artifact(path: Optional[Path] = None, db: Optional[Session] = None) -> Dict[str, Any]:
    target = path or artifact_path()
    target.parent.mkdir(parents=True, exist_ok=True)

    owns_session = db is None
    session = db or SessionLocal()
    try:
        artifact = compute_reward_artifact(session)
    finally:
        if owns_session:
            session.close()

    if target.exists():
        previous = target.with_name(f"{target.stem}.previous{target.suffix}")
        try:
            previous.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
        except Exception:
            pass

    version_path = target.with_name(f"{target.stem}.{_artifact_timestamp()}{target.suffix}")
    artifact["artifactPath"] = str(target)
    artifact["versionPath"] = str(version_path)

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(target.parent), delete=False) as tmp:
        json.dump(artifact, tmp, ensure_ascii=True, indent=2, sort_keys=True)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(target)
    try:
        version_path.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception:
        pass
    return artifact


def list_reward_artifacts(path: Optional[Path] = None) -> Dict[str, Any]:
    target = path or artifact_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(target.parent.glob(f"{target.stem}*{target.suffix}"), key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)
    out = []
    for file in files:
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        out.append(
            {
                "name": file.name,
                "path": str(file),
                "current": file.resolve() == target.resolve(),
                "previous": file.name == f"{target.stem}.previous{target.suffix}",
                "generatedAt": data.get("generatedAt") if isinstance(data, dict) else None,
                "trackCount": data.get("trackCount") if isinstance(data, dict) else None,
                "sizeBytes": file.stat().st_size if file.exists() else 0,
            }
        )
    return {"current": str(target), "artifacts": out}


def rollback_reward_artifact(name: Optional[str] = None, path: Optional[Path] = None) -> Dict[str, Any]:
    target = path or artifact_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    source = target.with_name(name) if name else target.with_name(f"{target.stem}.previous{target.suffix}")
    if source.parent.resolve() != target.parent.resolve() or not source.exists():
        raise FileNotFoundError(f"Reward artifact not found: {source.name}")
    if target.exists():
        rollback_backup = target.with_name(f"{target.stem}.rollback-backup.{_artifact_timestamp()}{target.suffix}")
        rollback_backup.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
    target.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    artifact = load_reward_artifact(target)
    return {"ok": True, "restored": source.name, "current": str(target), "trackCount": artifact.get("trackCount", 0)}


def load_reward_artifact(path: Optional[Path] = None) -> Dict[str, Any]:
    target = path or artifact_path()
    try:
        with target.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return data
    except Exception:
        return {}


def load_reward_scores(path: Optional[Path] = None) -> Dict[str, float]:
    artifact = load_reward_artifact(path)
    tracks = artifact.get("tracks") if isinstance(artifact, dict) else None
    if not isinstance(tracks, dict):
        return {}

    scores: Dict[str, float] = {}
    for track_id, row in tracks.items():
        if not isinstance(row, dict):
            continue
        try:
            scores[str(track_id)] = max(-1.0, min(1.0, float(row.get("score") or 0.0)))
        except Exception:
            continue
    return scores


def load_ranker_artifact(path: Optional[Path] = None) -> Dict[str, Any]:
    target = path or ranker_artifact_path()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def load_ranker_scores(path: Optional[Path] = None) -> Dict[str, float]:
    artifact = load_ranker_artifact(path)
    tracks = artifact.get("tracks") if isinstance(artifact, dict) else None
    if not isinstance(tracks, dict):
        return {}
    out: Dict[str, float] = {}
    for track_id, row in tracks.items():
        if not isinstance(row, dict):
            continue
        try:
            out[str(track_id)] = max(-1.0, min(1.0, float(row.get("score") or 0.0)))
        except Exception:
            continue
    return out


def _rate(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        return 0.0
    return round(float(numerator) / float(denominator), 6)


def _published_upload_ids(db: Session, days: Optional[int] = None) -> set[str]:
    try:
        query = db.query(CatalogTrack.id).filter(CatalogTrack.source_type == "upload", CatalogTrack.is_published.is_(True))
        if days is not None:
            query = query.filter(CatalogTrack.created_at >= datetime.now(timezone.utc) - timedelta(days=int(days)))
        return {track_id for (track_id,) in query.all() if track_id}
    except SQLAlchemyError:
        return set()


def compute_recommender_metrics(db: Session, days: int = 7) -> Dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days or 7)))
    rows = (
        db.query(Interaction.event, func.count(Interaction.id))
        .filter(Interaction.created_at >= since)
        .group_by(Interaction.event)
        .all()
    )
    events = {str(event or ""): int(count or 0) for event, count in rows}
    impressions = events.get("impression", 0)
    positive = sum(events.get(event, 0) for event in POSITIVE_EVENTS)
    negative = sum(events.get(event, 0) for event in NEGATIVE_EVENTS)

    upload_ids = _published_upload_ids(db)
    new_upload_ids = _published_upload_ids(db, days=30)
    upload_impressions = 0
    new_upload_impressions = 0
    if upload_ids:
        upload_impressions = (
            db.query(func.count(Interaction.id))
            .filter(
                Interaction.created_at >= since,
                Interaction.event == "impression",
                Interaction.track_id.in_(upload_ids),
            )
            .scalar()
            or 0
        )
    if new_upload_ids:
        new_upload_impressions = (
            db.query(func.count(Interaction.id))
            .filter(
                Interaction.created_at >= since,
                Interaction.event == "impression",
                Interaction.track_id.in_(new_upload_ids),
            )
            .scalar()
            or 0
        )

    conversions = (
        events.get("artist_click", 0)
        + events.get("follow_artist", 0)
        + events.get("open_spotify", 0)
        + events.get("save", 0)
    )
    quality_score = (
        4.0 * events.get("play_complete", 0)
        + 3.0 * events.get("play_30s", 0)
        + 5.0 * events.get("save", 0)
        + 4.0 * events.get("like", 0)
        + 6.0 * events.get("superlike", 0)
        + 2.5 * events.get("artist_click", 0)
        - 2.0 * events.get("skip", 0)
        - 3.0 * events.get("dislike", 0)
        - 5.0 * events.get("not_interested", 0)
    )

    return {
        "windowDays": max(1, int(days or 7)),
        "generatedAt": _now_iso(),
        "events": events,
        "impressions": impressions,
        "positiveSignals": positive,
        "negativeSignals": negative,
        "rates": {
            "playStart": _rate(events.get("play_start", 0), impressions),
            "play30s": _rate(events.get("play_30s", 0), impressions),
            "completion": _rate(events.get("play_complete", 0), impressions),
            "saveLike": _rate(events.get("save", 0) + events.get("like", 0) + events.get("superlike", 0), impressions),
            "skip": _rate(events.get("skip", 0), impressions),
            "artistClick": _rate(events.get("artist_click", 0) + events.get("follow_artist", 0), impressions),
            "conversion": _rate(conversions, impressions),
            "uploadExposure": _rate(upload_impressions, impressions),
            "newUploadExposure": _rate(new_upload_impressions, impressions),
        },
        "qualityScore": round(float(quality_score), 4),
    }


def _context_dict(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def evaluate_reward_artifact(db: Session, path: Optional[Path] = None, days: int = 30) -> Dict[str, Any]:
    scores = load_reward_scores(path)
    since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days or 30)))
    rows = (
        db.query(Interaction)
        .filter(Interaction.created_at >= since, Interaction.context_json.isnot(None))
        .order_by(Interaction.created_at.asc())
        .limit(20000)
        .all()
    )

    impressions: Dict[tuple[str, str], Dict[str, Any]] = {}
    outcomes: Dict[tuple[str, str], float] = {}
    for row in rows:
        ctx = _context_dict(row.context_json)
        request_id = str(ctx.get("request_id") or "").strip()
        track_id = (row.track_id or "").strip()
        if not request_id or not track_id:
            continue
        key = (request_id, track_id)
        event = (row.event or "").strip().lower()
        if event == "impression":
            impressions[key] = {"rank": int(ctx.get("rank") or 0), "score": scores.get(track_id, 0.0)}
        elif event in EVENT_WEIGHTS and event != "impression":
            outcomes[key] = outcomes.get(key, 0.0) + EVENT_WEIGHTS[event]

    comparable = []
    for key, impression in impressions.items():
        outcome = outcomes.get(key, 0.0)
        if outcome == 0:
            continue
        comparable.append({"key": key, "score": float(impression["score"]), "outcome": float(outcome)})

    wins = 0
    pairs = 0
    for i, left in enumerate(comparable):
        for right in comparable[i + 1 :]:
            if left["outcome"] == right["outcome"] or left["score"] == right["score"]:
                continue
            pairs += 1
            if (left["outcome"] > right["outcome"] and left["score"] > right["score"]) or (
                left["outcome"] < right["outcome"] and left["score"] < right["score"]
            ):
                wins += 1

    top_scored_positive = sum(1 for item in comparable if item["score"] > 0 and item["outcome"] > 0)
    top_scored_total = sum(1 for item in comparable if item["score"] > 0)
    return {
        "windowDays": max(1, int(days or 30)),
        "generatedAt": _now_iso(),
        "artifactTrackCount": len(scores),
        "impressionsWithOutcome": len(comparable),
        "pairwiseAccuracy": _rate(wins, pairs),
        "positivePrecisionWhenScorePositive": _rate(top_scored_positive, top_scored_total),
        "pairCount": pairs,
    }


def _track_feature_payload(track: Optional[CatalogTrack]) -> Dict[str, Any]:
    if not track:
        return {}
    features = getattr(track, "audio_features", None)
    payload: Dict[str, Any] = {
        "source_type": getattr(track, "source_type", None),
        "release_year": getattr(track, "release_year", None),
        "duration_ms": getattr(track, "duration_ms", None),
        "explicit": bool(getattr(track, "explicit", False)),
    }
    if features:
        for key in (
            "valence",
            "acousticness",
            "danceability",
            "energy",
            "instrumentalness",
            "liveness",
            "loudness",
            "speechiness",
            "tempo",
            "popularity",
        ):
            payload[key] = getattr(features, key, None)
    return payload


def collect_training_examples(db: Session, days: int = 90, limit: int = 100000) -> List[Dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(days=max(1, int(days or 90)))
    rows = (
        db.query(Interaction)
        .filter(Interaction.created_at >= since, Interaction.context_json.isnot(None))
        .order_by(Interaction.created_at.asc())
        .limit(max(100, min(int(limit or 100000), 500000)))
        .all()
    )

    examples: Dict[tuple[str, str], Dict[str, Any]] = {}
    for row in rows:
        ctx = _context_dict(row.context_json)
        request_id = str(ctx.get("request_id") or "").strip()
        track_id = (row.track_id or "").strip()
        if not request_id or not track_id:
            continue
        key = (request_id, track_id)
        event = (row.event or "").strip().lower()
        example = examples.setdefault(
            key,
            {
                "request_id": request_id,
                "track_id": track_id,
                "distinct_id": row.distinct_id,
                "rank": int(ctx.get("rank") or 0),
                "seed_ids": ctx.get("seed_ids") if isinstance(ctx.get("seed_ids"), list) else [],
                "recommendation_source": ctx.get("source"),
                "recommendation_source_type": ctx.get("source_type"),
                "impressed_at": row.created_at.isoformat() if row.created_at else None,
                "outcome_score": 0.0,
                "outcome_events": {},
            },
        )
        if event != "impression" and event in EVENT_WEIGHTS:
            example["outcome_score"] += EVENT_WEIGHTS[event]
            outcome_events = example["outcome_events"]
            outcome_events[event] = int(outcome_events.get(event, 0)) + 1

    track_ids = list({example["track_id"] for example in examples.values()})
    tracks: Dict[str, CatalogTrack] = {}
    if track_ids:
        try:
            for track in (
                db.query(CatalogTrack)
                .options(selectinload(CatalogTrack.audio_features))
                .filter(CatalogTrack.id.in_(track_ids))
                .all()
            ):
                tracks[track.id] = track
        except SQLAlchemyError:
            tracks = {}

    out = []
    for example in examples.values():
        example["features"] = _track_feature_payload(tracks.get(example["track_id"]))
        example["outcome_score"] = round(float(example["outcome_score"]), 6)
        out.append(example)
    return out


def write_training_dataset(path: Optional[Path] = None, db: Optional[Session] = None, days: int = 90) -> Dict[str, Any]:
    target = path or dataset_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    owns_session = db is None
    session = db or SessionLocal()
    try:
        examples = collect_training_examples(session, days=days)
    finally:
        if owns_session:
            session.close()

    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(target.parent), delete=False) as tmp:
        for example in examples:
            tmp.write(json.dumps(example, ensure_ascii=True, sort_keys=True) + "\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(target)
    return {"ok": True, "path": str(target), "rowCount": len(examples), "windowDays": max(1, int(days or 90))}


def _iter_dataset(path: Path) -> Iterable[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    rows.append(value)
            except Exception:
                continue
    return rows


def train_ranker_artifact(
    path: Optional[Path] = None,
    dataset: Optional[Path] = None,
    db: Optional[Session] = None,
    days: int = 90,
) -> Dict[str, Any]:
    target = path or ranker_artifact_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    dataset_target = dataset or dataset_path()
    if not dataset_target.exists():
        write_training_dataset(path=dataset_target, db=db, days=days)

    by_track: Dict[str, Dict[str, Any]] = {}
    for row in _iter_dataset(dataset_target):
        track_id = str(row.get("track_id") or "").strip()
        if not track_id:
            continue
        item = by_track.setdefault(track_id, {"outcomeTotal": 0.0, "rows": 0, "positiveRows": 0})
        outcome = float(row.get("outcome_score") or 0.0)
        item["outcomeTotal"] += outcome
        item["rows"] += 1
        if outcome > 0:
            item["positiveRows"] += 1

    tracks: Dict[str, Dict[str, Any]] = {}
    for track_id, row in by_track.items():
        avg = float(row["outcomeTotal"]) / max(1.0, float(row["rows"]))
        confidence = min(1.0, float(row["rows"]) / 25.0)
        score = max(-1.0, min(1.0, (avg / 10.0) * (0.35 + 0.65 * confidence)))
        tracks[track_id] = {
            "score": round(score, 6),
            "averageOutcome": round(avg, 6),
            "rowCount": int(row["rows"]),
            "positiveRows": int(row["positiveRows"]),
            "confidence": round(confidence, 4),
        }

    artifact = {
        "version": 1,
        "kind": "track-prior-ranker",
        "generatedAt": _now_iso(),
        "datasetPath": str(dataset_target),
        "trackCount": len(tracks),
        "tracks": tracks,
    }
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=str(target.parent), delete=False) as tmp:
        json.dump(artifact, tmp, ensure_ascii=True, indent=2, sort_keys=True)
        tmp.write("\n")
        tmp_path = Path(tmp.name)
    tmp_path.replace(target)
    return artifact


def main() -> None:
    import argparse
    import time

    parser = argparse.ArgumentParser(description="Build and evaluate Offtrack recommender artifacts.")
    parser.add_argument("command", nargs="?", default="build", choices=["build", "metrics", "evaluate", "dataset", "train", "loop"])
    parser.add_argument("--interval-seconds", type=int, default=int(os.getenv("RECOMMENDER_AGENT_INTERVAL_SECONDS", "3600")))
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()

    def run_once() -> Dict[str, Any]:
        with SessionLocal() as db:
            if args.command == "metrics":
                return {"ok": True, "metrics": compute_recommender_metrics(db, days=args.days)}
            if args.command == "evaluate":
                return {"ok": True, "evaluation": evaluate_reward_artifact(db, days=args.days)}
            if args.command == "dataset":
                return write_training_dataset(db=db, days=args.days)
            if args.command == "train":
                dataset_result = write_training_dataset(db=db, days=args.days)
                artifact = train_ranker_artifact(db=db, days=args.days)
                return {
                    "ok": True,
                    "dataset": dataset_result,
                    "ranker": {
                        "path": str(ranker_artifact_path()),
                        "trackCount": artifact.get("trackCount", 0),
                        "generatedAt": artifact.get("generatedAt"),
                    },
                }
        artifact = write_reward_artifact()
        return {"ok": True, "path": str(artifact_path()), "trackCount": artifact["trackCount"]}

    if args.command == "loop":
        interval = max(60, int(args.interval_seconds or 3600))
        while True:
            try:
                artifact = write_reward_artifact()
                print(json.dumps({"ok": True, "path": str(artifact_path()), "trackCount": artifact["trackCount"]}, indent=2), flush=True)
            except Exception as exc:
                print(json.dumps({"ok": False, "error": str(exc)}, indent=2), flush=True)
            time.sleep(interval)
    else:
        print(json.dumps(run_once(), indent=2), flush=True)


if __name__ == "__main__":
    main()
