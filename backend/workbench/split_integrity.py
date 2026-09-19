"""Transport integrity for public SciSplit outputs; no partition algorithms."""
import hashlib


PARTITIONS = ("train", "validation", "test", "excluded")


class SplitIntegrityError(ValueError):
    error_code = "INTEGRITY_FAILED"


class SplitInputError(ValueError):
    error_code = "VALIDATION_FAILED"


class SplitCapabilityError(SplitInputError):
    error_code = "UNSUPPORTED_CAPABILITY"


def validate_dataset(raw, data, frame):
    if (hashlib.sha256(raw).hexdigest() != data.sha256 or data.blob_key != data.sha256
            or len(frame) != data.rows or list(frame.columns) != data.columns):
        raise SplitIntegrityError("Dataset bytes, digest, row count or column order disagree")


def validate_split(assignments, report, rows, config=None):
    """Require a complete disjoint positional cover, including excluded rows."""
    if (not isinstance(assignments, list) or len(assignments) != rows
            or any(not isinstance(label, str) or label not in PARTITIONS for label in assignments)):
        raise SplitIntegrityError("Split must assign one supported label per original row")
    if not isinstance(report, dict) or not isinstance(report.get("diagnostics"), dict):
        raise SplitIntegrityError("Split has no serialized diagnostics")
    metadata = report.get("metadata")
    if not isinstance(metadata, dict) or not isinstance(metadata.get("config"), dict) or not isinstance(report.get("findings"), list):
        raise SplitIntegrityError("Split is missing configuration or findings")
    if config is not None and any(key not in metadata["config"] or metadata["config"][key] != value
                                  for key, value in config.items()):
        raise SplitIntegrityError("Split report disagrees with requested configuration")
    seen = set()
    for label in PARTITIONS:
        positions = report.get(label)
        if not isinstance(positions, list):
            raise SplitIntegrityError("Split is missing partition positions")
        for position in positions:
            if (type(position) is not int or not 0 <= position < rows or position in seen
                    or assignments[position] != label):
                raise SplitIntegrityError("Split positions are invalid, repeated or misaligned")
            seen.add(position)
        count = report["diagnostics"].get(f"n_{label}")
        if type(count) is not int or count != len(positions):
            raise SplitIntegrityError("Split diagnostic counts disagree with partition positions")
    if len(seen) != rows:
        raise SplitIntegrityError("Split does not cover every original row")
    if not report["train"] or not report["test"]:
        raise SplitIntegrityError("Split requires nonempty training and test partitions")


def validate_exchange(raw, data, partition, frame, row_id):
    validate_dataset(raw, data, frame)
    if partition.dataset_id != data.id or partition.project_id != data.project_id:
        raise SplitIntegrityError("Split does not belong to the selected dataset/project")
    validate_split(partition.assignments, partition.result, data.rows, partition.config)
    if row_id not in frame:
        raise SplitInputError("Benchmark row identity column is missing")
    identities = frame[row_id].tolist()
    if any(not isinstance(value, str) or not value.strip() for value in identities) or len(set(identities)) != len(identities):
        raise SplitInputError("Benchmark row identities must be nonblank unique strings")
    # Excluded rows retain their exact position and identity. Upstream admission
    # decides whether this complete exchange is admissible for its protocol.
    return [{"row_id": identity, "partition": label}
            for identity, label in zip(identities, partition.assignments, strict=True)]
