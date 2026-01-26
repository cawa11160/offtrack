from __future__ import annotations

import hashlib
import logging
import os
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, Request

log = logging.getLogger("offtrack.analytics")

try:
    # posthog-python
    from posthog import Posthog
except Exception:  # pragma: no cover
    Posthog = None  # type: ignore


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


class Analytics:
    """
    Thin wrapper around PostHog that never breaks product flows.
    - If POSTHOG_API_KEY is unset, analytics is disabled.
    - Failures are logged at debug and swallowed.
    - Distinct ID is taken from:
        1) X-Posthog-Distinct-Id header
        2) X-User-Id header
        3) request JSON field "distinct_id" (if present)
        4) a hashed fingerprint of (ip + user-agent) as last resort
    """

    def __init__(self) -> None:
        self.api_key = (os.getenv("POSTHOG_API_KEY") or "").strip()
        self.host = (os.getenv("POSTHOG_HOST") or "https://app.posthog.com").strip()
        self.enabled_flag = (os.getenv("POSTHOG_ENABLED") or "true").strip().lower() in ("1", "true", "yes", "y")
        self._client = None

        if self.is_enabled and Posthog is not None:
            try:
                self._client = Posthog(project_api_key=self.api_key, host=self.host)
            except Exception:
                self._client = None

    @property
    def is_enabled(self) -> bool:
        return bool(self.enabled_flag and self.api_key)

    def distinct_id(self, request: Request, explicit: Optional[str] = None) -> str:
        if explicit and str(explicit).strip():
            return str(explicit).strip()

        h = request.headers
        did = (h.get("X-Posthog-Distinct-Id") or h.get("X-User-Id") or "").strip()
        if did:
            return did

        # Last-resort fingerprint (not PII-safe if you send raw IP).
        # We hash it and only send the hash.
        ip = (request.client.host if request.client else "") or ""
        ua = (h.get("User-Agent") or "")[:200]
        return _sha256(f"{ip}||{ua}")

    def capture(
        self,
        background_tasks: BackgroundTasks,
        distinct_id: str,
        event: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.is_enabled or self._client is None:
            return

        props = properties or {}

        def _send() -> None:
            try:
                self._client.capture(distinct_id=distinct_id, event=event, properties=props)
            except Exception as e:
                log.debug("posthog capture failed: %s", e)

        background_tasks.add_task(_send)


_ANALYTICS: Optional[Analytics] = None


def get_analytics() -> Analytics:
    global _ANALYTICS
    if _ANALYTICS is None:
        _ANALYTICS = Analytics()
    return _ANALYTICS
