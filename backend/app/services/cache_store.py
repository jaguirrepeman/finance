"""
cache_store.py — Cache unificado con SQLite + TTL.

Reemplaza los 6+ mecanismos de caché dispersos (pickle, JSON, dicts en memoria)
por una sola abstracción persistente con TTLs diferenciados:
  - NAV (datos calientes): 4 horas
  - Info/Sectores/Regiones (datos fríos): 7 días
  - Historial NAV: 24 horas
  - Sitemap Finect: 7 días
  - Nombres de fondos: 30 días

Soporte dual:
  - Async (aiosqlite) para el core async de los providers.
  - Sync wrappers para acceso desde contextos sin event loop.
"""

import asyncio
import json
import logging
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TTL presets (segundos)
# ---------------------------------------------------------------------------

TTL_NAV = 4 * 3600  # 4 horas
TTL_NAV_HISTORY = 24 * 3600  # 24 horas
TTL_FUND_INFO = 7 * 24 * 3600  # 7 días
TTL_SECTORS = 7 * 24 * 3600  # 7 días
TTL_REGIONS = 7 * 24 * 3600  # 7 días
TTL_HOLDINGS = 7 * 24 * 3600  # 7 días
TTL_NAMES = 30 * 24 * 3600  # 30 días
TTL_SITEMAP = 7 * 24 * 3600  # 7 días

# SQLite busy timeout: how long (ms) to retry on lock before raising
_BUSY_TIMEOUT_MS = 60_000  # 60 seconds

# Max retries for database operations on lock errors
_MAX_RETRIES = 5
_RETRY_DELAY_S = 1.0

# Global threading lock to serialize sync writes across threads
# (prevents background pipeline from clashing with async writes)
_global_sync_write_lock = threading.Lock()


# ---------------------------------------------------------------------------
# CacheStore
# ---------------------------------------------------------------------------


class CacheStore:
    """Cache persistente basado en SQLite con TTL por entrada.

    Almacena valores serializados como JSON. Para DataFrames, se almacenan
    como lista de registros (records orientation).

    Args:
        db_path: Ruta al archivo SQLite. Si None, usa data/cache/cache.db.
    """

    def __init__(self, db_path: Optional[str | Path] = None) -> None:
        if db_path is None:
            # Use AppData\Local to avoid OneDrive sync locking the SQLite DB.
            # OneDrive holds file locks on synced files which causes
            # "database is locked" errors under concurrent access.
            import os
            local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
            base = Path(local_app_data) / "portfolio_tracker" / "cache"
            base.mkdir(parents=True, exist_ok=True)
            db_path = base / "cache.db"
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        # Async write lock to serialize concurrent writes and prevent DB lock errors
        self._write_lock = asyncio.Lock()
        self._remove_stale_journal()
        self._init_db()

    def _remove_stale_journal(self) -> None:
        """Elimina ficheros de journal/WAL obsoletos si existen (sesión anterior rota)."""
        for suffix in ("-journal", "-wal", "-shm"):
            stale = Path(str(self._db_path) + suffix)
            if stale.exists():
                try:
                    stale.unlink()
                    logger.warning("Stale SQLite file removed: %s", stale)
                except OSError:
                    pass

    @contextmanager
    def _conn(self):
        """Context manager para conexiones sync con WAL + busy_timeout + threading lock."""
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False, timeout=60)
        try:
            conn.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            yield conn
            conn.commit()
        finally:
            conn.close()

    @asynccontextmanager
    async def _aconn(self):
        """Context manager para conexiones async con WAL + busy_timeout."""
        import aiosqlite
        db = await aiosqlite.connect(str(self._db_path))
        try:
            await db.execute(f"PRAGMA busy_timeout={_BUSY_TIMEOUT_MS}")
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            yield db
            await db.commit()
        finally:
            await db.close()

    def _init_db(self) -> None:
        """Crea la tabla de caché si no existe y activa WAL mode."""
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cache (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    expires_at REAL NOT NULL
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cache_expires
                ON cache(expires_at)
            """)

    # ------------------------------------------------------------------
    # API Sync
    # ------------------------------------------------------------------

    def get(self, key: str) -> Optional[Any]:
        """Obtiene un valor de la caché. Retorna None si no existe o expiró."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        value_json, expires_at = row
        if time.time() > expires_at:
            self.delete(key)
            return None
        try:
            return json.loads(value_json)
        except (json.JSONDecodeError, TypeError):
            return None

    def set(self, key: str, value: Any, ttl: int) -> None:
        """Almacena un valor en la caché con TTL en segundos."""
        expires_at = time.time() + ttl
        value_json = json.dumps(value, ensure_ascii=False, default=str)
        with _global_sync_write_lock:
            with self._conn() as conn:
                conn.execute(
                    """INSERT OR REPLACE INTO cache (key, value, expires_at)
                       VALUES (?, ?, ?)""",
                    (key, value_json, expires_at),
                )

    def delete(self, key: str) -> None:
        """Elimina una entrada de la caché."""
        with _global_sync_write_lock:
            with self._conn() as conn:
                conn.execute("DELETE FROM cache WHERE key = ?", (key,))

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalida todas las entradas cuya key empieza por prefix."""
        with _global_sync_write_lock:
            with self._conn() as conn:
                cursor = conn.execute(
                    "DELETE FROM cache WHERE key LIKE ?",
                    (f"{prefix}%",),
                )
                return cursor.rowcount

    def cleanup_expired(self) -> int:
        """Elimina todas las entradas expiradas. Retorna el número eliminado."""
        with self._conn() as conn:
            cursor = conn.execute(
                "DELETE FROM cache WHERE expires_at < ?",
                (time.time(),),
            )
            return cursor.rowcount

    # ------------------------------------------------------------------
    # API Async (with write lock + retry for "database is locked")
    # ------------------------------------------------------------------

    async def _retry_async(self, operation, is_write: bool = False):
        """Execute an async DB operation with retry logic for lock errors."""
        for attempt in range(_MAX_RETRIES):
            try:
                if is_write:
                    async with self._write_lock:
                        return await operation()
                else:
                    return await operation()
            except Exception as exc:
                if "locked" in str(exc).lower() and attempt < _MAX_RETRIES - 1:
                    logger.warning(
                        "SQLite locked (attempt %d/%d), retrying in %.1fs...",
                        attempt + 1, _MAX_RETRIES, _RETRY_DELAY_S,
                    )
                    await asyncio.sleep(_RETRY_DELAY_S * (attempt + 1))
                else:
                    raise
        return None  # unreachable but satisfies type checker

    async def aget(self, key: str) -> Optional[Any]:
        """Versión async de get() con retry."""
        async def _op():
            async with self._aconn() as db:
                cursor = await db.execute(
                    "SELECT value, expires_at FROM cache WHERE key = ?",
                    (key,),
                )
                return await cursor.fetchone()

        row = await self._retry_async(_op, is_write=False)
        if row is None:
            return None
        value_json, expires_at = row
        if time.time() > expires_at:
            await self.adelete(key)
            return None
        try:
            return json.loads(value_json)
        except (json.JSONDecodeError, TypeError):
            return None

    async def aset(self, key: str, value: Any, ttl: int) -> None:
        """Versión async de set() con write lock + retry."""
        expires_at = time.time() + ttl
        value_json = json.dumps(value, ensure_ascii=False, default=str)

        async def _op():
            async with self._aconn() as db:
                await db.execute(
                    """INSERT OR REPLACE INTO cache (key, value, expires_at)
                       VALUES (?, ?, ?)""",
                    (key, value_json, expires_at),
                )

        await self._retry_async(_op, is_write=True)

    async def adelete(self, key: str) -> None:
        """Versión async de delete() con write lock + retry."""
        async def _op():
            async with self._aconn() as db:
                await db.execute("DELETE FROM cache WHERE key = ?", (key,))

        await self._retry_async(_op, is_write=True)

    async def ainvalidate_prefix(self, prefix: str) -> int:
        """Versión async de invalidate_prefix() con write lock + retry."""
        async def _op():
            async with self._aconn() as db:
                cursor = await db.execute(
                    "DELETE FROM cache WHERE key LIKE ?",
                    (f"{prefix}%",),
                )
                return cursor.rowcount

        result = await self._retry_async(_op, is_write=True)
        return result or 0

    # ------------------------------------------------------------------
    # Key helpers
    # ------------------------------------------------------------------

    @staticmethod
    def nav_key(isin: str) -> str:
        """Key para el NAV de un ISIN."""
        return f"nav:{isin}"

    @staticmethod
    def nav_date_key(isin: str) -> str:
        """Key para la fecha del NAV."""
        return f"nav_date:{isin}"

    @staticmethod
    def nav_history_key(isin: str, years: int) -> str:
        """Key para el historial de NAV."""
        return f"nav_history:{isin}:{years}y"

    @staticmethod
    def fund_info_key(isin: str) -> str:
        """Key para la info general del fondo."""
        return f"fund_info:{isin}"

    @staticmethod
    def sectors_key(isin: str) -> str:
        """Key para los sectores."""
        return f"sectors:{isin}"

    @staticmethod
    def regions_key(isin: str) -> str:
        """Key para las regiones."""
        return f"regions:{isin}"

    @staticmethod
    def holdings_key(isin: str) -> str:
        """Key para los holdings."""
        return f"holdings:{isin}"

    @staticmethod
    def name_key(isin: str) -> str:
        """Key para el nombre del fondo."""
        return f"name:{isin}"
