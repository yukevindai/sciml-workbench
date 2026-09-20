"""Supported LangGraph checkpoint setup; application ledgers remain authoritative."""
from contextlib import contextmanager
from sqlalchemy.engine import make_url


@contextmanager
def saver(database_url):
    from langgraph.checkpoint.postgres import PostgresSaver
    url = make_url(database_url)
    if url.get_backend_name() != 'postgresql':
        raise ValueError('Durable agent checkpoints require PostgreSQL')
    conninfo = url.set(drivername='postgresql').render_as_string(hide_password=False)
    with PostgresSaver.from_conn_string(conninfo) as checkpointer:
        yield checkpointer


def setup(database_url):
    """Operator maintenance step, never an implicit API startup migration."""
    with saver(database_url) as checkpointer:
        checkpointer.setup()


def config(run_id, assignment_id=None):
    return {'configurable': {'thread_id': run_id, 'checkpoint_ns': assignment_id or ''}}


if __name__ == '__main__':
    from .config import load_settings
    setup(load_settings().database_url)
