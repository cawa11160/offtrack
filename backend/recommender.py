from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine, wait_for_db
from models import Base

# -----------------------------
# Recommendation core
# -----------------------------
# This backend uses a content-based recommender over audio features (Spotify-like "audio features").
# Improvements vs the original:
#  - robust seed resolution (id > title/artist/year)
#  - soft popularity control (mode=indie/mainstream) instead of hard filtering
#  - candidate retrieval per-seed + blended query
#  - diversification (MMR) + artist/cluster caps to avoid repetitive lists
#  - optional cluster labels from artifacts/clusters.npy (if aligned)
#  - lightweight explanations ("why shown") per recommendation
#
# NOTE: This is still not Spotify-scale collaborative filtering; it's a strong, fast, and explainable baseline.

FEATURE_COLS: List[str] = [
    "valence",
    "acousticness",
    "danceability",
    "energy",
    "instrumentalness",
    "liveness",
    "loudness",
    "speechiness",
    "tempo",
]

HERE = Path(__file__).resolve().parent
CLUSTER_FILE = HERE / "artifacts" / "clusters.npy"


def _normalize(x: np.ndarray) -> np.ndarray:
    denom = np.linalg.norm(x, axis=1, keepdims=True) + 1e-12
    return x / denom


def _safe_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _artist_key(s: Any) -> str:
    # Keep it simple: treat the whole artists field as the key.
    # If you later store structured artists, you can normalize/split here.
    if not isinstance(s, str):
        return ""
    return " ".join(s.strip().lower().split())


@dataclass
class Recommender:
    df: Optional[pd.DataFrame] = None
    X: Optional[np.ndarray] = None
    id_to_pos: Optional[Dict[str, int]] = None
    clusters: Optional[np.ndarray] = None
    feat_mu: Optional[np.ndarray] = None
    feat_sigma: Optional[np.ndarray] = None

    def load(self) -> None:
        wait_for_db(timeout_s=45)

        # Ensure schema exists before querying
        Base.metadata.create_all(engine)

        with engine.connect() as conn:
            exists = conn.execute(text("SELECT to_regclass('public.tracks')")).scalar_one()
            if not exists:
                raise RuntimeError("Postgres table 'tracks' does not exist. Seed the DB first.")

            cnt = int(conn.execute(text("SELECT COUNT(*) FROM tracks")).scalar_one())
            if cnt <= 0:
                raise RuntimeError("Postgres table 'tracks' is empty. Run: python seed_db.py")

            df = pd.read_sql_query(text("SELECT * FROM tracks"), conn)

        # minimal validation
        for c in FEATURE_COLS + ["id", "name", "artists", "year", "popularity"]:
            if c not in df.columns:
                raise RuntimeError(f"Missing column in tracks table: {c}")

        df = df.reset_index(drop=True)

        # build feature matrix
        X = df[FEATURE_COLS].astype(float).to_numpy()
        mu = X.mean(axis=0)
        sigma = X.std(axis=0) + 1e-9  # for explanation z-scores
        Xn = _normalize(X)

        id_to_pos = {str(tid): i for i, tid in enumerate(df["id"].astype(str).tolist())}

        clusters = None
        try:
            if CLUSTER_FILE.exists():
                c = np.load(str(CLUSTER_FILE))
                if isinstance(c, np.ndarray) and len(c) == len(df):
                    clusters = c.astype(int, copy=False)
        except Exception:
            clusters = None

        self.df = df
        self.X = Xn
        self.id_to_pos = id_to_pos
        self.clusters = clusters
        self.feat_mu = mu
        self.feat_sigma = sigma

    # -----------------------------
    # Seed resolution
    # -----------------------------
    def _resolve_seed_positions(self, seeds: List[Dict[str, Any]]) -> List[int]:
        assert self.df is not None
        assert self.id_to_pos is not None

        df = self.df
        id_to_pos = self.id_to_pos

        picked_pos: List[int] = []

        for s in seeds:
            sid = (s.get("id") or "").strip()
            if sid and sid in id_to_pos:
                picked_pos.append(id_to_pos[sid])
                continue

            title = (s.get("title") or "").strip().lower()
            artist = (s.get("artist") or "").strip().lower()
            year = s.get("year")

            candidates = df
            if title:
                candidates = candidates[candidates["name"].astype(str).str.lower().str.contains(title, na=False)]
            if artist:
                candidates = candidates[candidates["artists"].astype(str).str.lower().str.contains(artist, na=False)]
            if year is not None:
                try:
                    y = int(year)
                    candidates = candidates[candidates["year"] == y]
                except Exception:
                    pass

            if len(candidates):
                # Most popular match is a reasonable default when multiple rows match.
                row = candidates.sort_values("popularity", ascending=False).iloc[0]
                rid = str(row.get("id"))
                if rid in id_to_pos:
                    picked_pos.append(id_to_pos[rid])

        # If user passed garbage, fallback to one popular seed (avoid empty q vector)
        if not picked_pos:
            top = df.sort_values("popularity", ascending=False).iloc[0]
            rid = str(top.get("id"))
            if rid in id_to_pos:
                picked_pos.append(id_to_pos[rid])

        # Deduplicate while keeping order
        seen = set()
        out: List[int] = []
        for p in picked_pos:
            if p not in seen:
                seen.add(p)
                out.append(p)
        return out

    # -----------------------------
    # Candidate retrieval + rerank
    # -----------------------------
    def _popularity_weight(self, pop: np.ndarray, mode: str) -> np.ndarray:
        """
        Returns a multiplicative weight in [~0.6, ~1.4] based on popularity and mode.

        - indie: downweight high-popularity tracks
        - mainstream: upweight high-popularity tracks
        - all: neutral
        """
        mode = (mode or "all").strip().lower()

        # squash popularity into [0,1]
        p = np.clip(pop.astype(float) / 100.0, 0.0, 1.0)

        if mode == "indie":
            # prefer lower popularity (monotonic decreasing)
            w = 1.15 - 0.55 * p
        elif mode == "mainstream":
            # prefer higher popularity (monotonic increasing)
            w = 0.85 + 0.55 * p
        else:
            w = np.ones_like(p)

        return np.clip(w, 0.6, 1.4)

    def _mmr_rerank(
        self,
        cand_pos: np.ndarray,
        sim_to_q: np.ndarray,
        n: int,
        lambda_diversity: float,
        artist_cap: int,
        cluster_cap: int,
    ) -> List[int]:
        """
        Maximal Marginal Relevance (MMR) reranking:
            score(i) = λ * sim(q,i) - (1-λ) * max_{j in selected} sim(i,j)
        plus lightweight caps to avoid repetition.
        """
        assert self.df is not None
        assert self.X is not None

        df = self.df
        X = self.X

        # prefetch artist + cluster keys for candidates
        cand_artists = [_artist_key(df.at[int(p), "artists"]) for p in cand_pos.tolist()]
        if self.clusters is not None:
            cand_clusters = [int(self.clusters[int(p)]) for p in cand_pos.tolist()]
        else:
            cand_clusters = [-1 for _ in cand_pos.tolist()]

        selected: List[int] = []
        selected_vecs: List[np.ndarray] = []

        artist_counts: Dict[str, int] = {}
        cluster_counts: Dict[int, int] = {}

        # Greedy selection
        for _ in range(int(n)):
            best = None
            best_score = -1e9

            for k, p in enumerate(cand_pos.tolist()):
                if p in selected:
                    continue

                akey = cand_artists[k]
                ckey = cand_clusters[k]

                if akey and artist_counts.get(akey, 0) >= int(artist_cap):
                    continue
                if ckey != -1 and cluster_counts.get(ckey, 0) >= int(cluster_cap):
                    continue

                # similarity to already selected items
                if selected_vecs:
                    # compute max cosine sim to selected
                    v = X[int(p)]
                    sims_sel = np.dot(np.stack(selected_vecs, axis=0), v)
                    max_sim_sel = float(np.max(sims_sel))
                else:
                    max_sim_sel = 0.0

                score = float(lambda_diversity) * float(sim_to_q[k]) - float(1.0 - lambda_diversity) * max_sim_sel
                if score > best_score:
                    best_score = score
                    best = (k, p)

            if best is None:
                break

            k, p = best
            selected.append(int(p))
            selected_vecs.append(X[int(p)])

            akey = cand_artists[k]
            if akey:
                artist_counts[akey] = artist_counts.get(akey, 0) + 1
            ckey = cand_clusters[k]
            if ckey != -1:
                cluster_counts[ckey] = cluster_counts.get(ckey, 0) + 1

        return selected

    def _explain(self, seed_pos: List[int], rec_pos: int) -> List[str]:
        """
        Lightweight explanations based on feature z-scores and cluster/artist overlap.
        """
        assert self.df is not None
        assert self.X is not None
        assert self.feat_mu is not None
        assert self.feat_sigma is not None

        df = self.df
        X = self.X
        mu = self.feat_mu
        sigma = self.feat_sigma

        reasons: List[str] = []

        # Same cluster as a seed (if available)
        if self.clusters is not None and seed_pos:
            c_rec = int(self.clusters[int(rec_pos)])
            c_seed = {int(self.clusters[int(p)]) for p in seed_pos}
            if c_rec in c_seed:
                reasons.append("Similar vibe cluster to your seed(s)")

        # Similar artist (rarely desired in long lists; keep it as a soft explanation)
        rec_artist = _artist_key(df.at[int(rec_pos), "artists"])
        if rec_artist and seed_pos:
            for p in seed_pos:
                if _artist_key(df.at[int(p), "artists"]) == rec_artist:
                    reasons.append("Same artist as a seed")
                    break

        # Feature proximity: which features are most different from dataset mean (gives human-friendly flavor)
        # Use *raw* feature deltas from mean (via z-score), but present only 2 most salient directions.
        # Compute on raw (unnormalized) features for interpretability.
        raw = df.loc[int(rec_pos), FEATURE_COLS].astype(float).to_numpy()
        z = (raw - mu) / sigma
        idx = np.argsort(-np.abs(z))[:2]
        feature_names = {
            "valence": "happier mood",
            "acousticness": "more acoustic",
            "danceability": "more danceable",
            "energy": "higher energy",
            "instrumentalness": "more instrumental",
            "liveness": "more live-feel",
            "loudness": "louder mix",
            "speechiness": "more spoken vocals",
            "tempo": "faster tempo",
        }
        for j in idx.tolist():
            col = FEATURE_COLS[int(j)]
            direction = "more" if z[int(j)] > 0 else "less"
            # map to phrase
            phrase = feature_names.get(col, col)
            if phrase.startswith("more") or phrase.startswith("less"):
                reasons.append(phrase)
            else:
                reasons.append(f"{direction} {phrase}")

        # Deduplicate and cap
        out = []
        seen = set()
        for r in reasons:
            r = r.strip()
            if r and r not in seen:
                seen.add(r)
                out.append(r)
        return out[:3]

    def recommend(
        self,
        seeds: List[Dict[str, Any]],
        n: int = 9,
        mode: str = "all",
        liked_ids: Optional[List[str]] = None,
        disliked_ids: Optional[List[str]] = None,
        exclude_ids: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        if self.df is None or self.X is None:
            raise RuntimeError("Recommender not loaded yet.")

        df = self.df
        X = self.X

        n = max(1, int(n))
        mode = (mode or "all").strip().lower()

        seed_pos = self._resolve_seed_positions(seeds)
        seed_ids = {str(df.at[int(p), "id"]) for p in seed_pos}

        seed_vecs = X[np.array(seed_pos, dtype=int)]
        q = _normalize(seed_vecs.mean(axis=0, keepdims=True))[0]

        # -----------------------------------
        # Candidate retrieval (fast + strong)
        # -----------------------------------
        # Blend:
        #  - topK from the blended query q
        #  - topK per seed (helps multi-seed mixes)
        #  - small exploratory sample (optional)
        Kq = 2500
        Ks = 1200

        sim_q_all = X @ q  # (N,)
        top_q = np.argpartition(-sim_q_all, kth=min(Kq, len(sim_q_all) - 1))[:Kq]

        cand = set(top_q.tolist())

        for p in seed_pos[:5]:
            sim_s = X @ X[int(p)]
            top_s = np.argpartition(-sim_s, kth=min(Ks, len(sim_s) - 1))[:Ks]
            cand.update(top_s.tolist())

        cand_pos = np.array(sorted(cand), dtype=int)

        # Remove seeds from candidates
        if len(seed_ids):
            mask = np.array([str(df.at[int(p), "id"]) not in seed_ids for p in cand_pos], dtype=bool)
            cand_pos = cand_pos[mask]

        # Avoid repeats across sessions/refreshes (frontend-supplied)
        if exclude_ids:
            try:
                excl = {str(x).strip() for x in (exclude_ids or []) if str(x).strip()}
                if excl:
                    mask = np.array([str(df.at[int(p), "id"]) not in excl for p in cand_pos], dtype=bool)
                    cand_pos = cand_pos[mask]
            except Exception:
                pass

        if len(cand_pos) == 0:
            return []

        # Similarity to q restricted to candidates
        sim_to_q = (X[cand_pos] @ q).astype(float)

        # Soft popularity control
        pop = df.loc[cand_pos, "popularity"].astype(int).to_numpy()
        pop_w = self._popularity_weight(pop, mode)
        score = sim_to_q * pop_w

        # -----------------------------
        # Personalization via feedback
        # -----------------------------
        # We adjust the ranking score using the user's historical likes/dislikes:
        #  - upweight tracks similar to liked centroid
        #  - downweight tracks similar to disliked centroid
        #  - add small bonuses/penalties for cluster overlap
        try:
            if self.id_to_pos is not None:
                id_to_pos = self.id_to_pos

                liked_pos = [id_to_pos.get(str(tid).strip()) for tid in (liked_ids or [])]
                liked_pos = [p for p in liked_pos if p is not None]
                if liked_pos:
                    v_like = np.mean(X[np.array(liked_pos, dtype=int)], axis=0, keepdims=True)
                    v_like = _normalize(v_like)[0]
                    sim_like = (X[cand_pos] @ v_like).astype(float)
                    score = score + 0.20 * sim_like
                    if self.clusters is not None:
                        liked_clusters = {int(self.clusters[int(p)]) for p in liked_pos}
                        c_cand = self.clusters[cand_pos].astype(int)
                        score = score + 0.05 * np.isin(c_cand, list(liked_clusters)).astype(float)

                disliked_pos = [id_to_pos.get(str(tid).strip()) for tid in (disliked_ids or [])]
                disliked_pos = [p for p in disliked_pos if p is not None]
                if disliked_pos:
                    v_dis = np.mean(X[np.array(disliked_pos, dtype=int)], axis=0, keepdims=True)
                    v_dis = _normalize(v_dis)[0]
                    sim_dis = (X[cand_pos] @ v_dis).astype(float)
                    score = score - 0.35 * sim_dis
                    if self.clusters is not None:
                        disliked_clusters = {int(self.clusters[int(p)]) for p in disliked_pos}
                        c_cand = self.clusters[cand_pos].astype(int)
                        score = score - 0.07 * np.isin(c_cand, list(disliked_clusters)).astype(float)
        except Exception:
            pass

        # Sort candidates by score (but reranking will diversify)
        order = np.argsort(-score)
        cand_pos = cand_pos[order]
        sim_to_q = score[order]

        # Keep a manageable pool for MMR (speed)
        pool = min(len(cand_pos), 2500)
        cand_pos = cand_pos[:pool]
        sim_to_q = sim_to_q[:pool]

        # -----------------------------------
        # Diversification rerank
        # -----------------------------------
        selected_pos = self._mmr_rerank(
            cand_pos=cand_pos,
            sim_to_q=sim_to_q,
            n=n,
            lambda_diversity=0.72,  # closer to "quality" while still diversifying
            artist_cap=2,
            cluster_cap=3,
        )

        # -----------------------------------
        # Build output
        # -----------------------------------
        recs: List[Dict[str, Any]] = []
        for p in selected_pos:
            row = df.iloc[int(p)]

            img = row.get("image_url", "") if "image_url" in row else ""
            if not isinstance(img, str):
                img = ""
            img = img.strip()

            rid = str(row.get("id", "") or "")
            recs.append(
                {
                    "id": rid,
                    "title": str(row.get("name", "") or ""),
                    "artist": str(row.get("artists", "") or ""),
                    "year": _safe_int(row.get("year", 0)),
                    "imageUrl": img,
                    "popularity": _safe_int(row.get("popularity", 0)),
                    "source": "db",
                    "reasons": self._explain(seed_pos, int(p)),
                }
            )

        # ultra-edge-case fallback
        if not recs and len(df) > 0:
            top = df.sort_values("popularity", ascending=False).iloc[0]
            img = top.get("image_url", "")
            if not isinstance(img, str):
                img = ""
            recs = [
                {
                    "id": str(top.get("id", "") or ""),
                    "title": str(top.get("name", "") or ""),
                    "artist": str(top.get("artists", "") or ""),
                    "year": _safe_int(top.get("year", 0)),
                    "imageUrl": img.strip(),
                    "popularity": _safe_int(top.get("popularity", 0)),
                    "source": "db",
                    "reasons": ["Popular fallback"],
                }
            ]

        return recs


# singleton
_RECO: Optional[Recommender] = None


def get_recommender() -> Recommender:
    global _RECO
    if _RECO is None:
        _RECO = Recommender()
    return _RECO
