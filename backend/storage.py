from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from fastapi.responses import RedirectResponse


@dataclass
class StoredObject:
    storage_path: str
    mime_type: str
    size_bytes: int
    backend: str


def storage_backend() -> str:
    return (os.getenv("MEDIA_STORAGE_BACKEND", "local").strip().lower() or "local")


def _s3_bucket() -> str:
    return os.getenv("S3_BUCKET", "").strip()


def _s3_prefix() -> str:
    return os.getenv("S3_KEY_PREFIX", "offtrack").strip().strip("/")


def is_remote_storage_path(value: str | Path | None) -> bool:
    return str(value or "").strip().startswith("s3://")


def storage_backend_for_path(value: str | Path | None) -> str:
    raw = str(value or "").strip()
    if raw.startswith("s3://"):
        return "s3"
    if raw:
        return "local"
    return "unknown"


def _parse_s3_uri(uri: str) -> tuple[str, str]:
    raw = (uri or "").strip()
    if not raw.startswith("s3://"):
        raise ValueError("Not an s3 uri")
    rest = raw[5:]
    bucket, _, key = rest.partition("/")
    if not bucket or not key:
        raise ValueError("Invalid s3 uri")
    return bucket, key


@lru_cache(maxsize=1)
def _s3_client() -> Any:
    try:
        import boto3  # type: ignore
    except Exception as exc:
        raise RuntimeError("boto3 is required when MEDIA_STORAGE_BACKEND=s3") from exc

    endpoint_url = os.getenv("S3_ENDPOINT_URL", "").strip() or None
    region = os.getenv("S3_REGION", "auto").strip() or "auto"
    access_key = os.getenv("S3_ACCESS_KEY_ID", "").strip() or os.getenv("AWS_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("S3_SECRET_ACCESS_KEY", "").strip() or os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
    kwargs: dict[str, Any] = {"region_name": region}
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    if access_key:
        kwargs["aws_access_key_id"] = access_key
    if secret_key:
        kwargs["aws_secret_access_key"] = secret_key
    return boto3.client("s3", **kwargs)


def _object_key(kind: str, object_id: str, ext: str) -> str:
    safe_kind = "".join(ch for ch in (kind or "media") if ch.isalnum() or ch in "-_/").strip("/") or "media"
    safe_id = "".join(ch for ch in (object_id or "") if ch.isalnum() or ch in "-_").strip() or "object"
    safe_ext = ext if ext.startswith(".") else f".{ext}"
    prefix = _s3_prefix()
    parts = [part for part in [prefix, safe_kind, f"{safe_id}{safe_ext}"] if part]
    return "/".join(parts)


async def save_upload_file(
    file: UploadFile,
    *,
    local_dir: Path,
    object_kind: str,
    object_id: str,
    ext: str,
    mime_type: str,
    max_bytes: int,
) -> StoredObject:
    backend = storage_backend()
    if backend in {"", "local", "disk", "filesystem"}:
        return await _save_local_file(
            file,
            local_dir=local_dir,
            object_id=object_id,
            ext=ext,
            mime_type=mime_type,
            max_bytes=max_bytes,
        )
    if backend in {"s3", "r2"}:
        return await _save_s3_file(
            file,
            object_kind=object_kind,
            object_id=object_id,
            ext=ext,
            mime_type=mime_type,
            max_bytes=max_bytes,
        )
    raise HTTPException(status_code=500, detail=f"Unsupported MEDIA_STORAGE_BACKEND: {backend}")


async def _save_local_file(
    file: UploadFile,
    *,
    local_dir: Path,
    object_id: str,
    ext: str,
    mime_type: str,
    max_bytes: int,
) -> StoredObject:
    local_dir.mkdir(parents=True, exist_ok=True)
    dest = local_dir / f"{object_id}{ext}"
    size = 0
    with open(dest, "wb") as out_f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                try:
                    dest.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=413, detail=f"File too large (>{max_bytes // (1024 * 1024)}MB)")
            out_f.write(chunk)
    return StoredObject(storage_path=str(dest), mime_type=mime_type, size_bytes=int(size), backend="local")


async def _save_s3_file(
    file: UploadFile,
    *,
    object_kind: str,
    object_id: str,
    ext: str,
    mime_type: str,
    max_bytes: int,
) -> StoredObject:
    bucket = _s3_bucket()
    if not bucket:
        raise HTTPException(status_code=500, detail="S3_BUCKET is required when MEDIA_STORAGE_BACKEND=s3")

    tmp_path = None
    size = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp_path = Path(tmp.name)
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise HTTPException(status_code=413, detail=f"File too large (>{max_bytes // (1024 * 1024)}MB)")
                tmp.write(chunk)

        key = _object_key(object_kind, object_id, ext)
        client = _s3_client()
        with open(tmp_path, "rb") as src:
            client.upload_fileobj(src, bucket, key, ExtraArgs={"ContentType": mime_type})
        return StoredObject(storage_path=f"s3://{bucket}/{key}", mime_type=mime_type, size_bytes=int(size), backend="s3")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Remote media upload failed: {exc}") from exc
    finally:
        if tmp_path:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass


def remote_media_url(storage_path: str) -> str:
    bucket, key = _parse_s3_uri(storage_path)
    public_base = os.getenv("S3_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if public_base:
        return f"{public_base}/{key}"

    expires = int(os.getenv("S3_SIGNED_URL_TTL_SEC", "3600") or "3600")
    client = _s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=max(60, min(expires, 7 * 24 * 60 * 60)),
    )


def remote_redirect_response(storage_path: str) -> RedirectResponse:
    return RedirectResponse(url=remote_media_url(storage_path), status_code=302)
