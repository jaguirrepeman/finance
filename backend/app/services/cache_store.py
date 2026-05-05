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

import json
import logging
import sqlite3
import time
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
            base = Path(__file__).resolve().parent.parent.parent / "data" / "cache"
            base.mkdir(parents=True, exist_ok=True)
            db_path = base / "cache.db"
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Crea la tabla de caché si no existe."""
        with sqlite3.connect(str(self._db_path)) as conn:
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
            conn.commit()

    # ------------------------------------------------------------------
    # API Sync
    # ------------------------------------------------------------------

    def get(self, key: str) -> Optional[Any]:
        """Obtiene un valor de la caché. Retorna None si no existe o expiró."""
        with sqlite3.connect(str(self._db_path)) as conn:
            row = conn.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        value_json, expires_at = row
        if time.time() > expires_at:
            # Expirado — limpieza lazy
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
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO cache (key, value, expires_at)
                   VALUES (?, ?, ?)""",
                (key, value_json, expires_at),
            )
            conn.commit()

    def delete(self, key: str) -> None:
        """Elimina una entrada de la caché."""
        with sqlite3.connect(str(self._db_path)) as conn:
            conn.execute("DELETE FROM cache WHERE key = ?", (key,))
            conn.commit()

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalida todas las entradas cuya key empieza por prefix."""
        with sqlite3.connect(str(self._db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM cache WHERE key LIKE ?",
                (f"{prefix}%",),
            )
            conn.commit()
            return cursor.rowcount

    def cleanup_expired(self) -> int:
        """Elimina todas las entradas expiradas. Retorna el número eliminado."""
        with sqlite3.connect(str(self._db_path)) as conn:
            cursor = conn.execute(
                "DELETE FROM cache WHERE expires_at < ?",
                (time.time(),),
            )
            conn.commit()
            return cursor.rowcount

    # ------------------------------------------------------------------
    # API Async
    # ------------------------------------------------------------------

    async def aget(self, key: str) -> Optional[Any]:
        """Versión async de get()."""
        import aiosqlite

        async with aiosqlite.connect(str(self._db_path)) as db:
            cursor = await db.execute(
                "SELECT value, expires_at FROM cache WHERE key = ?",
                (key,),
            )
            row = await cursor.fetchone()
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
        """Versión async de set()."""
        import aiosqlite

        expires_at = time.time() + ttl
        value_json = json.dumps(value, ensure_ascii=False, default=str)
        async with aiosqlite.connect(str(self._db_path)) as db:
            await db.execute(
                """INSERT OR REPLACE INTO cache (key, value, expires_at)
                   VALUES (?, ?, ?)""",
                (key, value_json, expires_at),
            )
            await db.commit()

    async def adelete(self, key: str) -> None:
        """Versión async de delete()."""
        import aiosqlite

        async with aiosqlite.connect(str(self._db_path)) as db:
            await db.execute("DELETE FROM cache WHERE key = ?", (key,))
            await db.commit()

    async def ainvalidate_prefix(self, prefix: str) -> int:
        """Versión async de invalidate_prefix()."""
        import aiosqlite

        async with aiosqlite.connect(str(self._db_path)) as db:
            cursor = await db.execute(
                "DELETE FROM cache WHERE key LIKE ?",
                (f"{prefix}%",),
            )
            await db.commit()
            return cursor.rowcount

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
