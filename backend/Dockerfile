FROM postgres:16-bookworm AS postgres-client
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git libpq5 liblz4-1 libzstd1 && rm -rf /var/lib/apt/lists/*
COPY --from=postgres-client /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-client /usr/lib/postgresql/16/bin/pg_restore /usr/local/bin/pg_restore
WORKDIR /app
COPY backend/ ./backend/
COPY contracts/ ./contracts/
RUN pip install --no-cache-dir -c backend/constraints.txt ./backend && useradd --uid 10001 --create-home workbench && mkdir /data && chown workbench /data
USER workbench
ENV WB_STORAGE_ROOT=/data PYTHONUNBUFFERED=1
CMD ["uvicorn", "workbench.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
