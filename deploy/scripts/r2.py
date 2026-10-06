#!/usr/bin/env python3
"""Minimal S3-compatible client for Cloudflare R2 (Python stdlib only).

Reads credentials from the environment (never from argv):

  BACKUP_R2_ENDPOINT
  BACKUP_R2_BUCKET
  BACKUP_R2_ACCESS_KEY_ID
  BACKUP_R2_SECRET_ACCESS_KEY
  BACKUP_R2_REGION   (default: auto)

Commands: put, head, list, delete, prune, --self-test
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Iterable
from xml.etree import ElementTree as ET

EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()
S3_NS = "http://s3.amazonaws.com/doc/2006-03-01/"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _hmac(key: bytes, msg: str) -> bytes:
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def signing_key(secret: str, datestamp: str, region: str, service: str) -> bytes:
    k_date = _hmac(("AWS4" + secret).encode("utf-8"), datestamp)
    k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()


def canonical_uri(bucket: str, key: str) -> str:
    encoded_key = urllib.parse.quote(key, safe="/")
    return f"/{bucket}/{encoded_key}" if key else f"/{bucket}"


def sign_headers(
    *,
    method: str,
    endpoint: str,
    bucket: str,
    key: str,
    access_key: str,
    secret_key: str,
    region: str,
    payload_hash: str,
    extra_headers: dict[str, str] | None = None,
    query: str = "",
    now: dt.datetime | None = None,
) -> dict[str, str]:
    parsed = urllib.parse.urlparse(endpoint)
    host = parsed.netloc
    amz_now = now or dt.datetime.now(dt.timezone.utc)
    amz_date = amz_now.strftime("%Y%m%dT%H%M%SZ")
    datestamp = amz_now.strftime("%Y%m%d")
    uri = canonical_uri(bucket, key)
    headers = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if extra_headers:
        headers.update({k.lower(): v for k, v in extra_headers.items()})
    signed_header_names = sorted(headers)
    signed_headers = ";".join(signed_header_names)
    canonical_headers = "".join(f"{name}:{headers[name]}\n" for name in signed_header_names)
    canonical_request = "\n".join(
        [
            method,
            uri,
            query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    scope = f"{datestamp}/{region}/s3/aws4_request"
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            scope,
            sha256_hex(canonical_request.encode("utf-8")),
        ]
    )
    signature = hmac.new(
        signing_key(secret_key, datestamp, region, "s3"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    headers["authorization"] = (
        f"AWS4-HMAC-SHA256 Credential={access_key}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return headers


class R2Config:
    def __init__(self) -> None:
        self.endpoint = os.environ.get("BACKUP_R2_ENDPOINT", "").rstrip("/")
        self.bucket = os.environ.get("BACKUP_R2_BUCKET", "")
        self.access_key = os.environ.get("BACKUP_R2_ACCESS_KEY_ID", "")
        self.secret_key = os.environ.get("BACKUP_R2_SECRET_ACCESS_KEY", "")
        self.region = os.environ.get("BACKUP_R2_REGION", "auto") or "auto"

    def missing(self) -> list[str]:
        names = []
        if not self.endpoint:
            names.append("BACKUP_R2_ENDPOINT")
        if not self.bucket:
            names.append("BACKUP_R2_BUCKET")
        if not self.access_key:
            names.append("BACKUP_R2_ACCESS_KEY_ID")
        if not self.secret_key:
            names.append("BACKUP_R2_SECRET_ACCESS_KEY")
        return names


def _request(
    cfg: R2Config,
    method: str,
    key: str,
    *,
    body: bytes | None = None,
    extra_headers: dict[str, str] | None = None,
    query: str = "",
) -> tuple[int, dict[str, str], bytes]:
    payload = body or b""
    payload_hash = sha256_hex(payload)
    headers = sign_headers(
        method=method,
        endpoint=cfg.endpoint,
        bucket=cfg.bucket,
        key=key,
        access_key=cfg.access_key,
        secret_key=cfg.secret_key,
        region=cfg.region,
        payload_hash=payload_hash,
        extra_headers=extra_headers,
        query=query,
    )
    url = cfg.endpoint + canonical_uri(cfg.bucket, key)
    if query:
        url = f"{url}?{query}"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as err:
        detail = err.read()
        raise SystemExit(f"R2 {method} {key} failed: HTTP {err.code} {detail[:400]!r}") from err


def cmd_put(cfg: R2Config, key: str, path: str) -> None:
    with open(path, "rb") as fh:
        payload = fh.read()
    digest = sha256_hex(payload)
    status, headers, _ = _request(
        cfg,
        "PUT",
        key,
        body=payload,
        extra_headers={
            "content-type": "application/octet-stream",
            "x-amz-meta-sha256": digest,
        },
    )
    if status not in (200, 201):
        raise SystemExit(f"R2 put unexpected status {status}")
    print(f"r2 put ok key={key} bytes={len(payload)} sha256={digest} etag={headers.get('etag', '')}")


def cmd_head(
    cfg: R2Config,
    key: str,
    expect_sha256: str | None,
    expect_size: int | None,
) -> None:
    status, headers, _ = _request(cfg, "HEAD", key)
    if status != 200:
        raise SystemExit(f"R2 head unexpected status {status}")
    size = int(headers.get("content-length", "0") or "0")
    remote_sha = headers.get("x-amz-meta-sha256", "")
    print(f"r2 head ok key={key} bytes={size} sha256={remote_sha} etag={headers.get('etag', '')}")
    if expect_size is not None and size != expect_size:
        raise SystemExit(f"R2 size mismatch: remote={size} local={expect_size}")
    if expect_sha256 and remote_sha and remote_sha != expect_sha256:
        raise SystemExit(f"R2 checksum mismatch: remote={remote_sha} local={expect_sha256}")
    if expect_sha256 and not remote_sha:
        raise SystemExit("R2 object is missing x-amz-meta-sha256")


def _iter_objects(cfg: R2Config, prefix: str) -> Iterable[tuple[str, dt.datetime, int]]:
    token = ""
    while True:
        parts = [("list-type", "2"), ("prefix", prefix)]
        if token:
            parts.append(("continuation-token", token))
        query = urllib.parse.urlencode(parts)
        status, _, body = _request(cfg, "GET", "", query=query)
        if status != 200:
            raise SystemExit(f"R2 list unexpected status {status}")
        root = ET.fromstring(body)
        for contents in root.findall(f"{{{S3_NS}}}Contents"):
            key = contents.findtext(f"{{{S3_NS}}}Key") or ""
            last = contents.findtext(f"{{{S3_NS}}}LastModified") or ""
            size = int(contents.findtext(f"{{{S3_NS}}}Size") or "0")
            when = dt.datetime.fromisoformat(last.replace("Z", "+00:00"))
            yield key, when, size
        truncated = root.findtext(f"{{{S3_NS}}}IsTruncated")
        if truncated != "true":
            break
        token = root.findtext(f"{{{S3_NS}}}NextContinuationToken") or ""
        if not token:
            break


def cmd_list(cfg: R2Config, prefix: str) -> None:
    for key, when, size in _iter_objects(cfg, prefix):
        print(f"{when.isoformat()} {size} {key}")


def cmd_delete(cfg: R2Config, key: str) -> None:
    status, _, _ = _request(cfg, "DELETE", key)
    if status not in (200, 204):
        raise SystemExit(f"R2 delete unexpected status {status}")
    print(f"r2 delete ok key={key}")


def cmd_prune(cfg: R2Config, prefix: str, days: int) -> None:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
    deleted = 0
    for key, when, _size in _iter_objects(cfg, prefix):
        if when < cutoff:
            cmd_delete(cfg, key)
            deleted += 1
    print(f"r2 prune ok prefix={prefix} older_than_days={days} deleted={deleted}")


def self_test() -> None:
    assert sha256_hex(b"") == EMPTY_SHA256
    now = dt.datetime(2013, 5, 24, 0, 0, 0, tzinfo=dt.timezone.utc)
    headers = sign_headers(
        method="GET",
        endpoint="https://examplebucket.s3.amazonaws.com",
        bucket="examplebucket",
        key="test.txt",
        access_key="AKIAIOSFODNN7EXAMPLE",
        secret_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        region="us-east-1",
        payload_hash=EMPTY_SHA256,
        now=now,
    )
    auth = headers["authorization"]
    assert auth.startswith("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request")
    assert "SignedHeaders=host;x-amz-content-sha256;x-amz-date" in auth
    assert "Signature=" in auth
    assert headers["x-amz-date"] == "20130524T000000Z"
    assert canonical_uri("bucket", "a/b c.age") == "/bucket/a/b%20c.age"
    print("r2.py self-test ok")


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Cloudflare R2 (S3 API) helper")
    parser.add_argument("--self-test", action="store_true")
    sub = parser.add_subparsers(dest="cmd")

    put = sub.add_parser("put")
    put.add_argument("key")
    put.add_argument("path")

    head = sub.add_parser("head")
    head.add_argument("key")
    head.add_argument("--expect-sha256", default="")
    head.add_argument("--expect-size", type=int, default=None)

    lst = sub.add_parser("list")
    lst.add_argument("--prefix", default="")

    delete = sub.add_parser("delete")
    delete.add_argument("key")

    prune = sub.add_parser("prune")
    prune.add_argument("--prefix", required=True)
    prune.add_argument("--days", type=int, required=True)

    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    if not args.cmd:
        parser.print_help()
        return 2

    cfg = R2Config()
    missing = cfg.missing()
    if missing:
        print("R2 not configured: missing " + ", ".join(missing), file=sys.stderr)
        return 2

    if args.cmd == "put":
        cmd_put(cfg, args.key, args.path)
    elif args.cmd == "head":
        cmd_head(cfg, args.key, args.expect_sha256 or None, args.expect_size)
    elif args.cmd == "list":
        cmd_list(cfg, args.prefix)
    elif args.cmd == "delete":
        cmd_delete(cfg, args.key)
    elif args.cmd == "prune":
        cmd_prune(cfg, args.prefix, args.days)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
