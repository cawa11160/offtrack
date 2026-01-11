# backend/recommender.py
from __future__ import annotations

from typing import List, Dict, Any, Optional
from pathlib import Path
import ast
import os

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import MiniBatchKMeans

HERE = Path(__file__).resolve().parent
DATA_PATH = HERE / "data" / "data" / "data.csv"

FEATURE_COLS = [
    "valence", "year", "acousticness", "danceability", "duration_ms", "energy",
    "explicit", "instrumentalness", "key", "liveness", "loudness", "mode",
    "popularity", "speechiness", "tempo"
]

# -----------------------------
# Quality knobs (tune as needed)
# -----------------------------
YEAR_WINDOW = 8
K_CLUSTERS = 60
MMR_LAMBDA = 0.85

# popularity guardrails
MIN_POPULARITY_ALL = 15
INDIE_POP_MAX = 55
MAINSTREAM_POP_MIN = 70

POPULARITY_BOOST = 0.12
YEAR_PENALTY = 0.10


def _parse_first_artist(x: Any) -> str:
    if pd.isna(x):
        return ""
    if isinstance(x, list):
        return str(x[0]) if x else ""
    s = str(x)
    try:
        v = ast.literal_eval(s)
        if isinstance(v, list) and v:
            return str(v[0])
    except Exception:
        pass
    return s


def _normalize(s: str) -> str:
    return str(s or "").strip().lower()


def _safe_year(y: Any) -> Optional[int]:
    try:
        yi = int(float(y))
        if 1900 <= yi <= 2035:
            return yi
    except Exception:
        pass
    return None


# -----------------------------
# Load dataset once
# -----------------------------
_df = pd.read_csv(DATA_PATH)

_df["name"] = _df["name"].astype(str).str.strip()
_df["name_norm"] = _df["name"].map(_normalize)
_df["artist_primary"] = _df["artists"].map(_parse_first_artist)
_df["artist_norm"] = _df["artist_primary"].map(_normalize)

for c in FEATURE_COLS:
    _df[c] = pd.to_numeric(_df[c], errors="coerce")

_df["year"] = _df["year"].map(_safe_year)
_df = _df.dropna(subset=["name_norm", "year", "id"]).copy()
_df["year"] = _df["year"].astype(int)
_df["id"] = _df["id"].astype(str)

# scaled matrix
_scaler = MinMaxScaler()
_X = _scaler.fit_transform(
    _df[FEATURE_COLS].fillna(0.0).to_numpy(dtype=np.float32))

_pop = _df["popularity"].fillna(0).to_numpy(dtype=np.float32)
_pop_norm = (_pop - _pop.min()) / (_pop.max() - _pop.min() + 1e-9)
_years = _df["year"].to_numpy(dtype=np.int32)

# -----------------------------
# Cluster coherence (fast + safe)
# -----------------------------
_DISABLE_CLUSTERING = os.getenv("DISABLE_CLUSTERING", "0") == "1"
_clusters = np.zeros(len(_df), dtype=np.int32)

if not _DISABLE_CLUSTERING and len(_df) >= 300:
    k = int(min(K_CLUSTERS, max(8, int(np.sqrt(len(_df))))))
    try:
        km = MiniBatchKMeans(
            n_clusters=k,
            random_state=0,
            batch_size=2048,
            n_init="auto",
            max_iter=200,
        )
        _clusters = km.fit_predict(_X).astype(np.int32)
    except Exception:
        _clusters = np.zeros(len(_df), dtype=np.int32)


def _find_track(title: str, year: Optional[int], artist: str = "") -> Optional[int]:
    t = _normalize(title)
    if not t:
        return None

    y = _safe_year(year) if year is not None else None
    a = _normalize(artist)

    if y is not None and a:
        hits = _df.index[(_df["name_norm"] == t) & (
            _df["year"] == y) & (_df["artist_norm"] == a)]
        if len(hits) > 0:
            return int(hits[0])

    if y is not None:
        hits = _df.index[(_df["name_norm"] == t) & (_df["year"] == y)]
        if len(hits) > 0:
            return int(hits[0])

    hits = _df.index[_df["name_norm"] == t]
    if len(hits) > 0:
        return int(hits[0])

    return None


def _mmr_select(scores: np.ndarray, X: np.ndarray, k: int, lam: float) -> List[int]:
    selected: List[int] = []
    cand = np.argsort(-scores)[:5000]

    for idx in cand:
        idx = int(idx)
        if scores[idx] <= -1e8:
            continue

        if not selected:
            selected.append(idx)
            if len(selected) >= k:
                break
            continue

        sims_to_sel = cosine_similarity(
            X[idx].reshape(1, -1), X[selected]).ravel()
        mmr = lam * float(scores[idx]) - (1.0 - lam) * \
            float(np.max(sims_to_sel))
        if mmr > -1e6:
            selected.append(idx)
            if len(selected) >= k:
                break

    return selected


def recommend(
    seeds: List[Dict[str, Any]],
    n: int = 10,
    mode: str = "all",  # "all" | "indie" | "mainstream"
) -> List[Dict[str, Any]]:
    mode = (mode or "all").strip().lower()
    if mode not in {"all", "indie", "mainstream"}:
        mode = "all"

    seed_idx: List[int] = []
    seed_years: List[int] = []
    seed_clusters: List[int] = []

    for s in seeds:
        idx = _find_track(s.get("title", ""), s.get(
            "year", None), s.get("artist", "") or "")
        if idx is not None:
            seed_idx.append(idx)
            seed_years.append(int(_df.iloc[idx]["year"]))
            seed_clusters.append(int(_clusters[idx]))

    if not seed_idx:
        return []

    seed_vec = _X[seed_idx].mean(axis=0, keepdims=True)
    sims = cosine_similarity(seed_vec, _X).ravel()

    seed_ids = set(_df.iloc[seed_idx]["id"].astype(str).tolist())

    year_mean = int(round(float(np.mean(seed_years))))
    year_mask = np.abs(_years - year_mean) <= YEAR_WINDOW

    if mode == "mainstream":
        pop_mask = _pop >= max(MAINSTREAM_POP_MIN, MIN_POPULARITY_ALL)
    elif mode == "indie":
        pop_mask = (_pop >= 5) & (_pop <= INDIE_POP_MAX)
    else:
        pop_mask = _pop >= MIN_POPULARITY_ALL

    # coherence via clusters (proxy for genre)
    seed_cluster_set = set(seed_clusters)
    cluster_mask = np.array(
        [c in seed_cluster_set for c in _clusters], dtype=bool)

    candidate_mask = year_mask & pop_mask & cluster_mask

    # relax if too strict
    if int(candidate_mask.sum()) < 150:
        candidate_mask = year_mask & pop_mask
    if int(candidate_mask.sum()) < 60:
        candidate_mask = pop_mask

    year_dist_norm = np.abs(_years - year_mean) / max(YEAR_WINDOW, 1)
    score = sims + POPULARITY_BOOST * _pop_norm - YEAR_PENALTY * year_dist_norm

    for i in seed_idx:
        score[int(i)] = -1e9
    score = np.where(candidate_mask, score, -1e9)

    picked = _mmr_select(score, _X, k=n, lam=MMR_LAMBDA)

    out: List[Dict[str, Any]] = []
    for i in picked:
        row = _df.iloc[int(i)]
        if str(row["id"]) in seed_ids:
            continue
        out.append({
            "title": row["name"],
            "artist": row["artist_primary"],
            "year": int(row["year"]),
            "id": str(row["id"]),
            "similarity": float(sims[int(i)]),
            "popularity": float(row.get("popularity", 0.0)),
        })

    return out
