"""Coordinated offline backup/restore for the single-operator PostgreSQL runtime.

All writers must be stopped by the operator. This command never stops services,
loads provider credentials, starts workers, clears leases, or overwrites a target.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
from uuid import uuid4

import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url


class BackupError(ValueError):
    pass


def connection(database_url):
    url = make_url(database_url)
    if url.get_backend_name() != 'postgresql' or not url.host or not url.database:
        raise BackupError('A complete PostgreSQL URL is required.')
    allowed = {'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'connect_timeout'}
    if set(url.query) - allowed:
        raise BackupError('Unsupported PostgreSQL URL options; use a dedicated database.')
    return url.set(drivername='postgresql')


def pg_environment(database_url):
    url = connection(database_url)
    env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
    env.update(PGHOST=url.host, PGPORT=str(url.port or 5432), PGDATABASE=url.database,
               PGUSER=url.username or '', PGPASSWORD=url.password or '', PGCONNECT_TIMEOUT='15')
    env.update({'PG' + k.upper(): v for k, v in url.query.items()})
    return env


def pg_command(program, arguments, database_url):
    # No URL/password in argv or subprocess diagnostics exposed to the operator.
    result = subprocess.run([program, '--no-password', *arguments],
                            env=pg_environment(database_url), capture_output=True)
    if result.returncode:
        raise BackupError(f'{program} failed; check client version, connectivity and permissions privately.')
    if result.stderr.strip():
        raise BackupError(f'{program} reported warnings; backup/restore was not accepted.')


def inventory(database_url):
    """Exact content fingerprints of every user table and sequence, not just ORM tables."""
    with psycopg.connect(connection(database_url).render_as_string(hide_password=False)) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        conn.execute("SET LOCAL TIME ZONE 'UTC'")
        tables, sequences = {}, {}
        relations = conn.execute("""SELECT n.nspname, c.relname, c.relkind
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
            AND c.relkind IN ('r', 'p', 'S') ORDER BY 1, 2""").fetchall()
        for schema, name, kind in relations:
            ident = sql.Identifier(schema, name)
            if kind == 'S':
                sequences[f'{schema}.{name}'] = list(conn.execute(
                    sql.SQL('SELECT last_value, is_called FROM {}').format(ident)).fetchone())
                continue
            digest, count = hashlib.sha256(), 0
            with conn.cursor(name='backup_inventory') as cursor:
                cursor.execute(sql.SQL('SELECT to_jsonb(t)::text FROM {} t ORDER BY to_jsonb(t)::text COLLATE "C"').format(ident))
                for row, in cursor:
                    digest.update(row.encode('utf-8') + b'\n')
                    count += 1
            tables[f'{schema}.{name}'] = {'rows': count, 'sha256': digest.hexdigest()}
        revisions = []
        if 'public.alembic_version' in tables:
            revisions = [r[0] for r in conn.execute('SELECT version_num FROM public.alembic_version ORDER BY 1')]
        return {'tables': tables, 'sequences': sequences, 'migration_revisions': revisions,
                'postgres_major': int(conn.info.server_version // 10000)}


def require_empty_database(database_url):
    with psycopg.connect(connection(database_url).render_as_string(hide_password=False)) as conn:
        count = conn.execute("""SELECT
            (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') +
            (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema') +
            (SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%'
             AND nspname NOT IN ('public', 'information_schema'))""").fetchone()[0]
        if count:
            raise BackupError('Restore requires an empty dedicated PostgreSQL database.')


def regular_tree(root):
    """Reject links, junctions and devices; return every file including dotfiles."""
    root = Path(root)
    found = {}
    def walk(path):
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise BackupError('Links/reparse points are not permitted in backup storage.')
        if stat.S_ISDIR(info.st_mode):
            for entry in sorted(path.iterdir()):
                walk(entry)
        elif stat.S_ISREG(info.st_mode):
            with path.open('rb') as handle:
                digest = hashlib.file_digest(handle, 'sha256').hexdigest()
            found[path.relative_to(root).as_posix()] = {'bytes': info.st_size, 'sha256': digest}
        else:
            raise BackupError('Non-regular entries are not permitted in backup storage.')
    if not root.is_dir():
        raise BackupError('Storage directory is missing.')
    walk(root)
    return found


def fresh_path(path):
    path = Path(path).absolute()
    # Resolve ancestors without silently following a final symlink.
    if path.exists() or path.is_symlink():
        raise BackupError('Destination already exists; choose a new isolated path.')
    return path.parent.resolve(strict=True) / path.name


def config_reference(reference):
    # Opaque password-manager entry/version, never a URL or copied configuration.
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. /-]{0,159}', reference):
        raise BackupError('Use a non-secret configuration record name/version, not values or URLs.')
    return reference


def require_stopped(writers_stopped):
    if not writers_stopped:
        raise BackupError('Stop all API, scientific, agent and upstream writers, then attest --writers-stopped.')


def create(database_url, storage_root, destination, *, revision, configuration_ref, writers_stopped=False):
    require_stopped(writers_stopped)
    if not re.fullmatch(r'[0-9a-f]{40}', revision):
        raise BackupError('Record the full reviewed application Git SHA.')
    config_reference(configuration_ref)
    start = time.monotonic()
    source = Path(storage_root).absolute()
    before_files = regular_tree(source)
    destination = fresh_path(destination)
    if destination.is_relative_to(source.resolve()):
        raise BackupError('Backup destination must be outside the data volume.')
    if not {'failure-memory.sqlite', '.efm-provisioned'} <= before_files.keys():
        raise BackupError('Complete provisioned Failure Memory storage is required.')
    before = inventory(database_url)
    if not before['migration_revisions'] or 'public.checkpoints' not in before['tables']:
        raise BackupError('Migrated metadata and checkpoint tables are required.')
    stage = destination.with_name('.' + destination.name + '.partial-' + uuid4().hex)
    stage.mkdir(mode=0o700)
    # Failed stages are retained for private diagnosis and are never valid backups.
    pg_command('pg_dump', ['--format=custom', '--file', str(stage / 'metadata.dump')], database_url)
    shutil.copytree(source, stage / 'data')
    if (before_files != regular_tree(stage / 'data') or before_files != regular_tree(source)
            or before != inventory(database_url)):
        raise BackupError('Source changed during backup; keep writers stopped and retry to a new destination.')
    manifest = {'format': 'workbench-backup-v1', 'backup_id': uuid4().hex,
                'created_at': datetime.now(timezone.utc).isoformat(), 'application_revision': revision,
                'configuration_ref': configuration_ref, 'database': before,
                'files': regular_tree(stage), 'backup_seconds': round(time.monotonic() - start, 3)}
    (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding='utf-8')
    verify(stage)
    # Sync the completed tree before publishing its directory name on Linux.
    sync_tree(stage)
    stage.rename(destination)
    sync_directory(destination.parent)
    return manifest


def verify(bundle):
    bundle = Path(bundle)
    actual = regular_tree(bundle)
    if 'manifest.json' not in actual:
        raise BackupError('Backup manifest is missing.')
    try:
        manifest = json.loads((bundle / 'manifest.json').read_text(encoding='utf-8'))
        if (manifest['format'] != 'workbench-backup-v1'
                or not re.fullmatch(r'[0-9a-f]{40}', manifest['application_revision'])
                or not manifest['database']['migration_revisions']
                or 'public.checkpoints' not in manifest['database']['tables']):
            raise ValueError()
        config_reference(manifest['configuration_ref'])
        del actual['manifest.json']
        if actual != manifest['files'] or not {'metadata.dump', 'data/failure-memory.sqlite',
                                               'data/.efm-provisioned'} <= actual.keys():
            raise ValueError()
        if any(name != 'metadata.dump' and not name.startswith('data/') for name in actual):
            raise ValueError()
    except (ValueError, KeyError, TypeError):
        raise BackupError('Backup manifest or file checksums are invalid.') from None
    return manifest


def sync_directory(path):
    if os.name == 'posix':
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def sync_tree(root):
    for path in root.rglob('*'):
        if path.is_file():
            with path.open('rb') as handle:
                os.fsync(handle.fileno())
    for path in sorted((p for p in root.rglob('*') if p.is_dir()), reverse=True):
        sync_directory(path)
    sync_directory(root)


def restore(bundle, database_url, storage_root, *, revision, writers_stopped=False):
    require_stopped(writers_stopped)
    start = time.monotonic()
    manifest = verify(bundle)
    if manifest['application_revision'] != revision:
        raise BackupError('Restore with the recorded application revision before upgrading.')
    destination = fresh_path(storage_root)
    if destination.is_relative_to(Path(bundle).resolve()):
        raise BackupError('Restore destination must be outside the backup.')
    require_empty_database(database_url)
    if inventory(database_url)['postgres_major'] != manifest['database']['postgres_major']:
        raise BackupError('Use the same PostgreSQL major version for the restore drill.')
    stage = destination.with_name('.' + destination.name + '.restore-' + uuid4().hex)
    stage.mkdir(mode=0o700)
    shutil.copytree(Path(bundle) / 'data', stage, dirs_exist_ok=True)
    stage.chmod(0o700)
    expected = {k[5:]: v for k, v in manifest['files'].items() if k.startswith('data/')}
    if regular_tree(stage) != expected:
        raise BackupError('Restored file checksums differ; do not start services.')
    sync_tree(stage)
    pg_command('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges',
                             '--dbname', connection(database_url).database,
                             str(Path(bundle).resolve() / 'metadata.dump')], database_url)
    if inventory(database_url) != manifest['database']:
        raise BackupError('Restored database differs; preserve the isolated target and do not start services.')
    stage.rename(destination)
    sync_directory(destination.parent)
    return {'backup_id': manifest['backup_id'], 'restored_at': datetime.now(timezone.utc).isoformat(),
            'restore_seconds': round(time.monotonic() - start, 3),
            'verification': 'all_database_rows_and_files_match', 'services_started': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ('create', 'restore', 'verify'):
        command = sub.add_parser(name)
        command.add_argument('bundle')
        if name != 'verify':
            command.add_argument('--storage-root', required=True)
            command.add_argument('--revision', required=True)
            command.add_argument('--database-env', default='WB_DATABASE_URL')
            command.add_argument('--writers-stopped', action='store_true')
        if name == 'create':
            command.add_argument('--configuration-ref', required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'verify':
            result = verify(args.bundle)
        else:
            url = os.environ[args.database_env]
            options = dict(revision=args.revision, writers_stopped=args.writers_stopped)
            if args.command == 'create':
                result = create(url, args.storage_root, args.bundle,
                                configuration_ref=args.configuration_ref, **options)
            else:
                result = restore(args.bundle, url, args.storage_root, **options)
        # No configuration, file contents, database URL or subprocess diagnostics.
        print(json.dumps({k: result[k] for k in ('backup_id', 'backup_seconds', 'restore_seconds',
                                               'verification', 'services_started') if k in result}))
        return 0
    except BackupError as exc:
        print(str(exc), file=sys.stderr)
    except Exception:
        print('Backup/restore failed; inspect permissions, configuration and private targets. Do not start restored services.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
