"""Vercel FastAPI entrypoint. Migrations are an operator step, never cold-start IO."""
from workbench.api import create_app
from workbench.config import load_settings
from workbench.serverless import install

settings = load_settings()
app = create_app(settings)
install(app, settings)
