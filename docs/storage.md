# Immutable local storage (D02)

`BlobStore` remains a two-method interface: `put(bytes) -> key` and `get(key) -> bytes`. Keys are lowercase SHA-256 digests of the exact bytes. There is no delete or rollback method. Original byte-order marks, line endings, quoting and binary content are preserved. User filenames remain display metadata and never select storage paths.

## Publication and reads

`LocalStore.put` accepts immutable `bytes`, stages them in a unique private `.put-*` directory inside the blob directory, flushes and synchronizes the file, then verifies its stored digest. The staged file is created with owner-only permissions on POSIX systems. Publication uses a hard link to create the digest path only if absent. This makes complete bytes visible in one filesystem operation without replacing an existing blob.

When another writer already published that key, `put` reads and verifies the existing file and compares its bytes before returning the shared key. A corrupt existing file causes failure; another upload never silently repairs it. Normal cleanup removes only the calling operation's staging directory. Linux synchronizes the blob directory after publication/cleanup, including on a deduplicated write. A synchronization failure is reported even if complete bytes have already become visible; that object is retained and a later retry verifies it.

`get` rejects malformed keys, missing content, digest mismatches, symlink/reparse-point entries and non-regular files. It compares the opened file's identity to the inspected entry before reading and uses no-follow/nonblocking open flags where supported. The blob directory itself cannot be a symlink or junction. These checks require a managed volume writable only by trusted workbench processes; they are not a sandbox against an administrator or hostile process that can mutate that volume concurrently.

The stored layout remains `<WB_STORAGE_ROOT>/blobs/<64-character digest>`. Existing valid blobs are readable without migration, rehashing into new keys or permission rewrites. The concrete `LocalStore.path` helper is for diagnostics/tests; application and adapter consumers use only `put`/`get`.

## Filesystem and failure boundary

Production uses a local Linux filesystem supporting same-filesystem hard links and directory `fsync`. A filesystem that rejects those operations fails with `STORAGE_UNAVAILABLE`; there is no fallback to truncating or overwriting the digest path. Native Windows development tests exercise NTFS publication but do not establish directory-sync durability; D01's supported supervised runtime remains Linux containers or WSL. File and directory synchronization provide the software publication boundary; hardware durability still depends on the mounted filesystem and storage system.

Implementation references: Python's [filesystem operations](https://docs.python.org/3.12/library/os.html#os.link) and [private temporary files/directories](https://docs.python.org/3.12/library/tempfile.html#tempfile.TemporaryDirectory).

| Failure | Consumer behavior |
|---|---|
| Invalid key, missing blob, corrupt bytes or unsafe file type | `StorageIntegrityError`, code `INTEGRITY_FAILED`; API returns 500 without filesystem paths or content. |
| Permission, capacity, filesystem or synchronization failure | `StorageError`, code `STORAGE_UNAVAILABLE`; API returns 503 with a safe operator hint. |
| Worker storage failure | Job fails with the storage error code and no successful result/artifact publication. Bundle-storage failures are not scientific admission failures. |
| Metadata transaction rollback | Metadata/provenance rolls back; published bytes remain. The key may already be referenced by another project or transaction. |
| Process death before publication | No final key exposes staged bytes. A private staging directory can remain. |
| Failure/death after publication | Complete bytes can remain unreferenced. Never delete the digest as compensation. |

`StorageError` inherits `ValueError` for compatibility with existing integrity checks. Scientific consumers must let storage errors propagate before generic scientific `ValueError` handling. The API uses the existing B01 error vocabulary; no schema or response-envelope change was required.

## Adapter workspaces and cleanup

Benchmark and PDF adapters receive separate system temporary directories named with `wb-benchmark-` and `wb-evidence-` prefixes. They materialize verified input bytes there, run public upstream APIs, and capture output bundles before context cleanup. They never receive a mutable blob-store path. Temporary directories are private on POSIX and are removed after normal return or Python exceptions. Process termination can leave workspaces behind; cleanup/recovery after worker termination belongs to D03/D04.

No automatic garbage collector or orphan sweep is added. Operators must stop writers and account for all project/report references and retention before considering cleanup; a database rollback is not evidence that a digest is unreferenced. Preserve the complete volume together with metadata for coordinated backup. Failure Memory's mutable SQLite storage is outside this blob interface.

## Acceptance

`backend/tests/test_storage.py` covers exact bytes, concurrent process/thread publishers, unchanged existing objects, malformed paths, missing/corrupt/non-regular entries, publication visibility, file/directory sync ordering, interrupted writers, injected storage failures and actual metadata rollback under SQLite/PostgreSQL. `test_storage_consumers.py` checks API/worker errors, absence of misleading scientific results, and parallel adapter workspace cleanup. The existing real-upstream workflow verifies audit, split, baseline, PDF ingestion, report export and replay through the hardened store.

See [D02 evidence and handoff](tickets/D02.md) for the exact checks run and their limits. B03 still owns intake/versioned artifact integration and B05 owns complete project-scoped lineage resolution; a digest alone never grants artifact access.
