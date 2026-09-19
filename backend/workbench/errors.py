"""Safe application errors shared by service boundaries."""


class DomainError(Exception):
    def __init__(self, message, status=422, error_code=None):
        self.message, self.status = message, status
        self.error_code = error_code or {
            401: "UNAUTHORIZED", 403: "POLICY_DENIED", 404: "ARTIFACT_NOT_FOUND",
            409: "IDEMPOTENCY_CONFLICT", 413: "UPLOAD_TOO_LARGE", 422: "VALIDATION_FAILED",
            503: "DEPENDENCY_UNAVAILABLE",
        }.get(status, "INTERNAL_ERROR")
        super().__init__(message)
