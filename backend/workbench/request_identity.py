"""Version 1 canonical request identity; persisted digests never change in place."""

import hashlib
import json


def request_digest(kind: str, payload: dict) -> str:
    encoded = json.dumps(
        {"identity_version": 1, "kind": kind, "payload": payload},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
