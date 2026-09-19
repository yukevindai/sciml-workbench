"""Exact-byte, project-owned attachment intake. Parsing is not scientific admission."""

import csv
import hashlib
import io
from pathlib import PurePosixPath
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from pydantic import ValidationError
from .contracts import Provenance
from .scientific_contracts import DatasetV2, SourceDeclarations
from .db import MaterialRow
from .request_identity import request_digest
from .services import DomainError, project, save, software


def inspect_csv(raw, settings):
    if len(raw) > settings.max_upload_bytes:
        raise DomainError("Upload exceeds configured byte limit", 413)
    if b"\x00" in raw:
        raise DomainError("CSV must not contain NUL bytes")
    try:
        reader = csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
        header = next(reader, [])
        if not header or len(header) > 200 or any(not x.strip() for x in header) or len(set(header)) != len(header):
            raise DomainError("CSV needs 1–200 unique, nonblank column names")
        count = 0
        for row in reader:
            count += 1
            if count > settings.max_rows:
                raise DomainError("CSV exceeds configured row limit")
            if len(row) != len(header):
                raise DomainError("CSV has ragged or blank rows")
        if count < 3:
            raise DomainError("CSV must contain at least 3 data rows")
        return header, count
    except (UnicodeError, csv.Error) as exc:
        raise DomainError("Upload a valid UTF-8 CSV") from exc


def filename(value):
    name = PurePosixPath(value.replace("\\", "/")).name
    if not name.strip() or len(name) > 200 or any(ord(c) < 32 for c in name):
        raise DomainError("Provide a filename of 1–200 characters without control characters")
    return name


def dataset(session, store, settings, pid, raw, name, source=None):
    project(session, pid)
    columns, rows = inspect_csv(raw, settings)
    source = source or SourceDeclarations()
    # Public intake accepts operator assertions, not fabricated source locators.
    if any(getattr(source, field).origin not in {"unknown", "user_supplied"} for field in SourceDeclarations.model_fields):
        raise DomainError("Intake declarations must be unknown or user supplied")
    digest = hashlib.sha256(raw).hexdigest()
    try:
        value = DatasetV2(project_id=pid, filename=filename(name), blob_key=digest, sha256=digest,
                          columns=columns, rows=rows, source=source,
                          unresolved_fields=[field for field in SourceDeclarations.model_fields
                                             if getattr(source, field).origin == "unknown"], software=software())
    except ValidationError as exc:
        raise DomainError("Source declarations do not match the CSV columns") from exc
    store.put(raw)
    save(session, value)
    save(session, Provenance(project_id=pid, activity="upload", inputs=[], outputs=[value.id],
                             parameters={"source": source.model_dump(mode="json")}, software=software()))
    return value


def attach(session, store, settings, pid, raw, name, media_type, source, request_key):
    project(session, pid)
    if not request_key or not request_key.strip() or len(request_key) > 100:
        raise DomainError("Provide an Idempotency-Key of 1–100 characters")
    if len(raw) > settings.max_upload_bytes:
        raise DomainError("Upload exceeds configured byte limit", 413)
    name = filename(name)
    if media_type not in {"text/csv", "application/pdf"}:
        raise DomainError("Attach a CSV or PDF with its supported Content-Type")
    if media_type == "application/pdf":
        if source is not None:
            raise DomainError("Dataset declarations apply only to CSV attachments")
        if not raw.startswith(b"%PDF-"):
            raise DomainError("Upload a PDF document")
    digest = hashlib.sha256(raw).hexdigest()
    source = (source or SourceDeclarations()) if media_type == "text/csv" else None
    identity = request_digest("attachment", {"sha256": digest, "filename": name, "media_type": media_type,
                                             "source": source.model_dump(mode="json") if source else None})
    query = select(MaterialRow).where(MaterialRow.project_id == pid, MaterialRow.request_key == request_key)

    def replay(old):
        if old.request_digest != identity:
            raise DomainError("Idempotency key was used for a different attachment", 409)
        return old

    old = session.scalar(query)
    if old is not None:
        return replay(old)
    try:
        with session.begin_nested():
            data = dataset(session, store, settings, pid, raw, name, source) if media_type == "text/csv" else None
            if data is None:
                store.put(raw)  # Full PDF parsing belongs to the bounded evidence worker.
            from .barriers import lock_project
            lock_project(session, pid)
            session.flush()
            material = MaterialRow(project_id=pid, request_key=request_key, request_digest=identity,
                                   filename=name, media_type=media_type, blob_key=digest, sha256=digest,
                                   dataset_id=data.id if data else None)
            session.add(material)
            session.flush()
    except IntegrityError:
        old = session.scalar(query)
        if old is None:
            raise
        return replay(old)
    return material


def material(session, pid, mid):
    from .artifacts import resolve_material
    return resolve_material(session, pid, mid)
