from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from sqlalchemy import text

from db import engine, wait_for_db
from models import Base


FEATURE_COLS = [
    "valence", "acousticness", "danceability", "energy",
    "instrumentalness", "liveness", "loudness", "speechiness", "tempo",
]


def _normalize(x: np.ndarray) -> np.ndarray:
    denom = np.linalg.norm(x, axis=1, keepdims=True) + 1e-12
    return x / denom


@dataclass
class Recommender:
    df: Optional[pd.DataFrame] = None
    X: Optional[np.ndarray] = None

    def load(self) -> None:
        wait_for_db(timeout_s=45)

        # ✅ ensure schema exists before querying
        Base.metadata.create_all(engine)

        with engine.connect() as conn:
            # if table doesn't exist, to_regclass returns None
            exists = conn.execute(
                text("SELECT to_regclass('public.tracks')")).scalar_one()
            if not exists:
                raise RuntimeError(
                    "Postgres table 'tracks' does not exist. Seed the DB first.")

            cnt = int(conn.execute(
                text("SELECT COUNT(*) FROM tracks")).scalar_one())
            if cnt <= 0:
                raise RuntimeError(
                    "Postgres table 'tracks' is empty. Run: python seed_db.py")

            df = pd.read_sql_query(text("SELECT * FROM tracks"), conn)

        # minimal validation
        for c in FEATURE_COLS + ["id", "name", "artists", "year", "popularity"]:
            if c not in df.columns:
                raise RuntimeError(f"Missing column in tracks table: {c}")

        # build feature matrix
        X = df[FEATURE_COLS].astype(float).to_numpy()
        X = _normalize(X)

        self.df = df
        self.X = X

    def _seed_rows(self, seeds: List[Dict[str, Any]]) -> pd.DataFrame:
        assert self.df is not None
        df = self.df

        picked = []

        # Prefer ID match if provided
        for s in seeds:
            sid = (s.get("id") or "").strip()
            if sid:
                r = df[df["id"] == sid]
                if len(r):
                    picked.append(r.iloc[0])
                    continue

            title = (s.get("title") or "").strip().lower()
            artist = (s.get("artist") or "").strip().lower()
            year = s.get("year")

            candidates = df
            if title:
                candidates = candidates[candidates["name"].str.lower(
                ).str.contains(title, na=False)]
            if artist:
                candidates = candidates[candidates["artists"].str.lower(
                ).str.contains(artist, na=False)]
            if year is not None:
                try:
                    y = int(year)
                    candidates = candidates[candidates["year"] == y]
                except Exception:
                    pass

            if len(candidates):
                picked.append(candidates.sort_values(
                    "popularity", ascending=False).iloc[0])

        if not picked:
            # fallback: most popular seeds if user passed garbage
            picked.append(df.sort_values(
                "popularity", ascending=False).iloc[0])

        return pd.DataFrame(picked)

    def recommend(self, seeds: List[Dict[str, Any]], n: int = 9, mode: str = "all") -> List[Dict[str, Any]]:
        if self.df is None or self.X is None:
            raise RuntimeError("Recommender not loaded yet.")

        df = self.df.copy()
        X = self.X

        # mode filter
        mode = (mode or "all").strip().lower()
        if mode == "indie":
            df = df[df["popularity"] <= 40]
        elif mode == "mainstream":
            df = df[df["popularity"] >= 60]

        # If filter leaves nothing, fallback to full set
        if len(df) == 0:
            df = self.df.copy()

        # align X with filtered df
        idx = df.index.to_numpy()
        Xf = X[idx]

        seed_df = self._seed_rows(seeds)
        seed_idx = seed_df.index.to_numpy()

        seed_vecs = X[seed_idx]
        q = _normalize(seed_vecs.mean(axis=0, keepdims=True))

        sims = (Xf @ q.T).reshape(-1)  # cosine similarity since normalized
        order = np.argsort(-sims)

        # exclude exact seeds by id
        seed_ids = set(seed_df["id"].tolist())

        recs: List[Dict[str, Any]] = []
        for j in order:
            row = df.iloc[int(j)]

            rid = row.get("id")
            if rid in seed_ids:
                continue

            img = row.get("image_url", "") if "image_url" in row else ""
            if not isinstance(img, str):
                img = ""
            img = img.strip()

            recs.append(
                {
                    "id": rid,
                    "title": row.get("name", ""),
                    "artist": row.get("artists", ""),
                    "year": int(row.get("year", 0) or 0),
                    "imageUrl": img,
                    "popularity": int(row.get("popularity", 0) or 0),
                    "source": "db",
                }
            )

            if len(recs) >= int(n):
                break

        # ultra-edge-case fallback (shouldn’t happen, but avoids empty response)
        if not recs and len(self.df) > 0:
            top = self.df.sort_values("popularity", ascending=False).iloc[0]
            img = top.get("image_url", "")
            if not isinstance(img, str):
                img = ""
            recs = [{
                "id": top.get("id", ""),
                "title": top.get("name", ""),
                "artist": top.get("artists", ""),
                "year": int(top.get("year", 0) or 0),
                "imageUrl": img.strip(),
                "popularity": int(top.get("popularity", 0) or 0),
                "source": "db",
            }]

        return recs


# singleton
_RECO: Optional[Recommender] = None


def get_recommender() -> Recommender:
    global _RECO
    if _RECO is None:
        _RECO = Recommender()
    return _RECO
