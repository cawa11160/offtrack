from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
import ast
import os

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity

from sqlalchemy import text

try:
    from db import engine
except ImportError:
    from backend.db import engine

# -----------------------------
# Tunables
# -----------------------------
FEATURE_COLS = [
    "valence",
    "acousticness",
    "danceability",
    "duration_ms",
    "energy",
    "explicit",
    "instrumentalness",
    "key",
    "liveness",
    "loudness",
    "mode",
    "popularity",
    "speechiness",
    "tempo",
]

YEAR_WINDOW = 8
INDIE_POP_MAX = 40
MAINSTREAM_POP_MIN = 70

# mixing weights
ALPHA_SIM = 0.78
ALPHA_POP = 0.12
ALPHA_YEAR = 0.10

# diversity / MMR
MMR_LAMBDA = 0.85


def _normalize(s: str) -> str:
    s = (s or "").strip().lower()
    return "".join(ch for ch in s if ch.isalnum() or ch.isspace()).strip()


def _parse_first_artist(x: Any) -> str:
    # dataset stores artists like "['A', 'B']"
    if x is None:
        return ""
    if isinstance(x, str):
        t = x.strip()
        if t.startswith("[") and t.endswith("]"):
            try:
                v = ast.literal_eval(t)
                if isinstance(v, list) and v:
                    return str(v[0])
            except Exception:
                pass
        return t.split(",")[0].strip()
    if isinstance(x, list) and x:
        return str(x[0])
    return str(x)


def _safe_year(y: Any) -> Optional[int]:
    try:
        if y is None:
            return None
        y = int(float(str(y)))
        if 1800 <= y <= 2100:
            return y
    except Exception:
        pass
    return None


def _mmr_select(scores: np.ndarray, X: np.ndarray, k: int, lam: float = MMR_LAMBDA) -> List[int]:
    # Maximal marginal relevance: select high-score while avoiding near-duplicates.
    k = int(k)
    if k <= 0:
        return []
    n = int(scores.shape[0])
    if n == 0:
        return []

    first = int(np.argmax(scores))
    selected = [first]
    if k == 1:
        return selected

    candidates = np.arange(n, dtype=np.int32)
    candidates = candidates[candidates != first]

    for _ in range(k - 1):
        best_idx = None
        best_val = -1e18
        for idx in candidates:
            sims_to_sel = cosine_similarity(
                X[idx].reshape(1, -1), X[selected]).ravel()
            mmr = lam * float(scores[idx]) - \
                (1.0 - lam) * float(np.max(sims_to_sel))
            if mmr > best_val:
                best_val = mmr
                best_idx = int(idx)
        if best_idx is None:
            break
        selected.append(best_idx)
        candidates = candidates[candidates != best_idx]
        if candidates.size == 0:
            break

    return selected


@dataclass
class RecommenderState:
    df: pd.DataFrame
    X: np.ndarray
    years: np.ndarray
    pop: np.ndarray
    pop_norm: np.ndarray
    scaler: MinMaxScaler


class Recommender:
    def __init__(self):
        self._state: Optional[RecommenderState] = None

    def load(self, limit: Optional[int] = None) -> None:
        # Pull required columns from Postgres
        cols = ["id", "name", "artists", "image_url", "year"] + FEATURE_COLS
        q = f"SELECT {', '.join(cols)} FROM tracks"
        if limit is not None:
            q += f" LIMIT {int(limit)}"

        df = pd.read_sql_query(text(q), engine)

        if df.empty:
            raise RuntimeError(
                "Postgres table 'tracks' is empty. Run: python seed_db.py (or seed via your own pipeline)."
            )

        # type normalization
        df["id"] = df["id"].astype(str)
        df["name"] = df["name"].astype(str).str.strip()
        df["artists"] = df["artists"].astype(str)

        df["name_norm"] = df["name"].map(_normalize)
        df["artist_primary"] = df["artists"].map(_parse_first_artist)
        df["artist_norm"] = df["artist_primary"].map(_normalize)

        df["year"] = df["year"].map(_safe_year)
        for c in FEATURE_COLS:
            df[c] = pd.to_numeric(df[c], errors="coerce")

        df = df.dropna(subset=["id", "name_norm", "year"]).copy()
        df["year"] = df["year"].astype(int)

        # Scale feature matrix
        scaler = MinMaxScaler()
        X = scaler.fit_transform(df[FEATURE_COLS].to_numpy(dtype=np.float32))

        pop = df["popularity"].fillna(0).to_numpy(dtype=np.float32)
        pop_norm = (pop - pop.min()) / (pop.max() - pop.min() + 1e-9)
        years = df["year"].to_numpy(dtype=np.int32)

        self._state = RecommenderState(
            df=df.reset_index(drop=True),
            X=X,
            years=years,
            pop=pop,
            pop_norm=pop_norm,
            scaler=scaler,
        )

    def ensure_loaded(self) -> None:
        if self._state is None:
            self.load()

    def _find_seed_idx(self, seed: Dict[str, Any]) -> Optional[int]:
        st = self._state
        assert st is not None
        df = st.df

        sid = (seed.get("id") or "").strip()
        if sid:
            hits = df.index[df["id"] == sid]
            if len(hits) > 0:
                return int(hits[0])

        t = _normalize(seed.get("title", ""))
        a = _normalize(seed.get("artist", ""))
        y = _safe_year(seed.get("year"))

        if not t:
            return None

        if y is not None and a:
            hits = df.index[(df["name_norm"] == t) & (
                df["year"] == y) & (df["artist_norm"] == a)]
            if len(hits) > 0:
                return int(hits[0])

        if y is not None:
            hits = df.index[(df["name_norm"] == t) & (df["year"] == y)]
            if len(hits) > 0:
                return int(hits[0])

        hits = df.index[df["name_norm"] == t]
        if len(hits) > 0:
            return int(hits[0])

        return None

    def recommend(self, seeds: List[Dict[str, Any]], n: int = 9, mode: str = "all") -> List[Dict[str, Any]]:
        self.ensure_loaded()
        st = self._state
        assert st is not None

        df, X, years, pop, pop_norm = st.df, st.X, st.years, st.pop, st.pop_norm

        n = int(max(1, min(50, n)))
        mode = (mode or "all").lower().strip()
        if mode not in {"all", "indie", "mainstream"}:
            mode = "all"

        seed_idxs: List[int] = []
        for s in seeds:
            idx = self._find_seed_idx(s)
            if idx is not None:
                seed_idxs.append(idx)

        if not seed_idxs:
            # fallback: most popular tracks (filtered by mode)
            mask = np.ones(len(df), dtype=bool)
            if mode == "indie":
                mask = pop <= INDIE_POP_MAX
            elif mode == "mainstream":
                mask = pop >= MAINSTREAM_POP_MIN
            order = np.argsort(-pop_norm)
            out = []
            for i in order:
                if not mask[i]:
                    continue
                out.append(_row_to_rec(df.iloc[int(i)]))
                if len(out) >= n:
                    break
            return out

        seed_vec = X[seed_idxs].mean(axis=0, keepdims=True)

        sim = cosine_similarity(seed_vec, X).ravel().astype(np.float32)

        # basic year preference: mean seed year
        seed_year = int(np.mean(years[seed_idxs]))
        year_dist = np.abs(years - seed_year).astype(np.float32)
        year_score = 1.0 - np.clip(year_dist / float(YEAR_WINDOW), 0.0, 1.0)

        # combine
        score = ALPHA_SIM * sim + ALPHA_POP * pop_norm + ALPHA_YEAR * year_score

        # filter: remove the seeds themselves
        mask = np.ones(len(df), dtype=bool)
        mask[seed_idxs] = False

        # popularity regime filter
        if mode == "indie":
            mask &= (pop <= INDIE_POP_MAX)
        elif mode == "mainstream":
            mask &= (pop >= MAINSTREAM_POP_MIN)

        # take a larger pool then diversify using MMR
        cand_idx = np.where(mask)[0]
        if cand_idx.size == 0:
            return []

        # top pool
        pool_size = int(min(max(200, n * 80), cand_idx.size))
        top_pool = cand_idx[np.argsort(-score[cand_idx])[:pool_size]]

        sel_local = _mmr_select(
            score[top_pool], X[top_pool], k=n, lam=MMR_LAMBDA)
        final_idx = [int(top_pool[i]) for i in sel_local]

        return [_row_to_rec(df.iloc[i]) for i in final_idx]


def _row_to_rec(row: pd.Series) -> Dict[str, Any]:
    return {
        "id": str(row.get("id", "")),
        "title": str(row.get("name", "")),
        "artist": str(row.get("artist_primary", row.get("artists", ""))),
        "year": int(row.get("year", 0)) if row.get("year") is not None else None,
        "popularity": float(row.get("popularity", 0)),
        "imageUrl": str(row.get("image_url", "") or ""),
    }


# Singleton used by the API layer
_RECOMMENDER = Recommender()


def get_recommender() -> Recommender:
    return _RECOMMENDER
