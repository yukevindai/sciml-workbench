FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/ ./backend/
COPY contracts/ ./contracts/
RUN pip install --no-cache-dir -c backend/constraints.txt ./backend && useradd --uid 10001 --create-home workbench && mkdir /data && chown workbench /data
USER workbench
ENV WB_STORAGE_ROOT=/data PYTHONUNBUFFERED=1
CMD ["uvicorn", "workbench.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
