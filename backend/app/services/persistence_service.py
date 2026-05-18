"""persistence_service.py — Persistencia de carteras guardadas y favoritos.

Usa SQLite (misma ruta que CacheStore) para almacenar:
  - Carteras hipotéticas (listas de ISINs con pesos)
  - Fondos favoritos (watchlist personal)

Compatible con el patrón sync/async del proyecto.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# DB path (same directory as CacheStore)
# ---------------------------------------------------------------------------

def _get_db_path() -> Path:
    import os

    local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    base = Path(local_app_data) / "portfolio_tracker" / "cache"
    base.mkdir(parents=True, exist_ok=True)
    return base / "portfolio_tracker.db"


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS portfolios (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    color       TEXT    DEFAULT '#4ca1af',
    total_value REAL    DEFAULT 0.0,
    created_at  REAL    NOT NULL,
    updated_at  REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_funds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    isin         TEXT    NOT NULL,
    name         TEXT    NOT NULL DEFAULT '',
    weight       REAL    NOT NULL DEFAULT 0.0
);

CREATE TABLE IF NOT EXISTS favorites (
    isin       TEXT PRIMARY KEY,
    name       TEXT    NOT NULL DEFAULT '',
    notes      TEXT    DEFAULT '',
    added_at   REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_positions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    isin              TEXT    NOT NULL,
    name              TEXT    NOT NULL DEFAULT '',
    tipo              TEXT    NOT NULL DEFAULT 'RV',
    capital_invertido REAL    NOT NULL DEFAULT 0.0,
    participaciones   REAL    DEFAULT NULL,
    fecha_compra      TEXT    DEFAULT NULL,
    added_at          REAL    NOT NULL,
    updated_at        REAL    NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    isin            TEXT    NOT NULL,
    fecha           TEXT    NOT NULL,
    participaciones REAL    NOT NULL,
    notes           TEXT    DEFAULT '',
    created_at      REAL    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_override_isin_fecha
    ON transaction_overrides(isin, fecha);

CREATE TABLE IF NOT EXISTS excluded_movements (
    isin        TEXT    NOT NULL,
    fecha       TEXT    NOT NULL,
    created_at  REAL    NOT NULL,
    PRIMARY KEY (isin, fecha)
);
"""


# ---------------------------------------------------------------------------
# PersistenceService
# ---------------------------------------------------------------------------


class PersistenceService:
    """Gestiona carteras guardadas y lista de favoritos en SQLite.

    Usage::

        svc = PersistenceService()
        pid = svc.create_portfolio("Mi Cartera Conservadora", funds=[...])
        svc.add_favorite("IE00B4L5Y983", "MSCI World")
    """

    @staticmethod
    def _ts_to_iso(ts: float | None) -> str | None:
        """Convert a Unix timestamp (seconds) to ISO-8601 string for the frontend."""
        if ts is None:
            return None
        try:
            return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
        except (ValueError, OSError):
            return None

    @staticmethod
    def _fix_timestamps(p: dict[str, Any]) -> dict[str, Any]:
        """Convert created_at / updated_at / added_at from float → ISO string in-place."""
        for key in ("created_at", "updated_at", "added_at"):
            if key in p and isinstance(p[key], (int, float)):
                p[key] = PersistenceService._ts_to_iso(p[key])
        return p

    def __init__(self, db_path: str | Path | None = None) -> None:
        self._db_path = Path(db_path) if db_path else _get_db_path()
        self._init_db()

    # ── internal ──────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self._db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_DDL)
            # Migration: add total_value column if it doesn't exist (existing DBs)
            cols = [r[1] for r in conn.execute("PRAGMA table_info(portfolios)").fetchall()]
            if "total_value" not in cols:
                conn.execute("ALTER TABLE portfolios ADD COLUMN total_value REAL DEFAULT 0.0")
            # Migration: manual_positions — move from ISIN primary key to autoincrement id
            # If the old schema is detected (no 'id' column), recreate the table preserving data.
            mp_cols = {r[1] for r in conn.execute("PRAGMA table_info(manual_positions)").fetchall()}
            if "id" not in mp_cols:
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS manual_positions_new (
                        id                INTEGER PRIMARY KEY AUTOINCREMENT,
                        isin              TEXT    NOT NULL,
                        name              TEXT    NOT NULL DEFAULT '',
                        tipo              TEXT    NOT NULL DEFAULT 'RV',
                        capital_invertido REAL    NOT NULL DEFAULT 0.0,
                        participaciones   REAL    DEFAULT NULL,
                        fecha_compra      TEXT    DEFAULT NULL,
                        added_at          REAL    NOT NULL,
                        updated_at        REAL    NOT NULL
                    );
                    INSERT INTO manual_positions_new
                        (isin, name, tipo, capital_invertido, participaciones, fecha_compra, added_at, updated_at)
                    SELECT isin, name, tipo,
                           COALESCE(capital_invertido, valor_actual, 0),
                           participaciones, fecha_compra,
                           COALESCE(added_at, 0), COALESCE(updated_at, 0)
                    FROM manual_positions;
                    DROP TABLE manual_positions;
                    ALTER TABLE manual_positions_new RENAME TO manual_positions;
                """)
            elif "valor_actual" in mp_cols:
                # Remove legacy valor_actual column (was in intermediate schema)
                conn.executescript("""
                    CREATE TABLE IF NOT EXISTS manual_positions_new (
                        id                INTEGER PRIMARY KEY AUTOINCREMENT,
                        isin              TEXT    NOT NULL,
                        name              TEXT    NOT NULL DEFAULT '',
                        tipo              TEXT    NOT NULL DEFAULT 'RV',
                        capital_invertido REAL    NOT NULL DEFAULT 0.0,
                        participaciones   REAL    DEFAULT NULL,
                        fecha_compra      TEXT    DEFAULT NULL,
                        added_at          REAL    NOT NULL,
                        updated_at        REAL    NOT NULL
                    );
                    INSERT INTO manual_positions_new
                        (id, isin, name, tipo, capital_invertido, participaciones, fecha_compra, added_at, updated_at)
                    SELECT id, isin, name, tipo,
                           COALESCE(capital_invertido, valor_actual, 0),
                           participaciones, fecha_compra, added_at, updated_at
                    FROM manual_positions;
                    DROP TABLE manual_positions;
                    ALTER TABLE manual_positions_new RENAME TO manual_positions;
                """)
            # Migration: create excluded_movements table if it doesn't exist (existing DBs)
            existing_tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "excluded_movements" not in existing_tables:
                conn.execute("""
                    CREATE TABLE excluded_movements (
                        isin        TEXT    NOT NULL,
                        fecha       TEXT    NOT NULL,
                        created_at  REAL    NOT NULL,
                        PRIMARY KEY (isin, fecha)
                    )
                """)
    # ── portfolios ────────────────────────────────────────────────────────

    def list_portfolios(self) -> list[dict[str, Any]]:
        """Devuelve todas las carteras guardadas (sin sus fondos)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM portfolios ORDER BY updated_at DESC"
            ).fetchall()
            result = []
            for row in rows:
                p = dict(row)
                # Fund count
                count = conn.execute(
                    "SELECT COUNT(*) FROM portfolio_funds WHERE portfolio_id = ?",
                    (p["id"],),
                ).fetchone()[0]
                p["fund_count"] = count
                result.append(self._fix_timestamps(p))
            return result

    def get_portfolio(self, portfolio_id: int) -> dict[str, Any] | None:
        """Devuelve una cartera con su lista de fondos."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM portfolios WHERE id = ?", (portfolio_id,)
            ).fetchone()
            if not row:
                return None
            p = dict(row)
            funds = conn.execute(
                "SELECT isin, name, weight FROM portfolio_funds WHERE portfolio_id = ? ORDER BY weight DESC",
                (portfolio_id,),
            ).fetchall()
            p["funds"] = [dict(f) for f in funds]
            return self._fix_timestamps(p)

    def create_portfolio(
        self,
        name: str,
        funds: list[dict],  # [{isin, name, weight}]
        description: str = "",
        color: str = "#4ca1af",
        total_value: float = 0.0,
    ) -> dict[str, Any]:
        """Crea una nueva cartera. Devuelve la cartera creada."""
        now = time.time()
        with self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO portfolios (name, description, color, total_value, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                (name, description, color, float(total_value or 0), now, now),
            )
            pid = cur.lastrowid
            for f in funds:
                conn.execute(
                    "INSERT INTO portfolio_funds (portfolio_id, isin, name, weight) VALUES (?,?,?,?)",
                    (pid, f["isin"], f.get("name", ""), float(f.get("weight", 0))),
                )
        return self.get_portfolio(pid)

    def update_portfolio(
        self,
        portfolio_id: int,
        name: str | None = None,
        description: str | None = None,
        color: str | None = None,
        funds: list[dict] | None = None,
        total_value: float | None = None,
    ) -> dict[str, Any] | None:
        """Actualiza una cartera existente. Devuelve la cartera actualizada."""
        now = time.time()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM portfolios WHERE id = ?", (portfolio_id,)
            ).fetchone()
            if not existing:
                return None

            fields, values = [], []
            if name is not None:
                fields.append("name = ?"); values.append(name)
            if description is not None:
                fields.append("description = ?"); values.append(description)
            if color is not None:
                fields.append("color = ?"); values.append(color)
            if total_value is not None:
                fields.append("total_value = ?"); values.append(float(total_value))
            fields.append("updated_at = ?"); values.append(now)
            values.append(portfolio_id)

            conn.execute(f"UPDATE portfolios SET {', '.join(fields)} WHERE id = ?", values)

            if funds is not None:
                conn.execute(
                    "DELETE FROM portfolio_funds WHERE portfolio_id = ?", (portfolio_id,)
                )
                for f in funds:
                    conn.execute(
                        "INSERT INTO portfolio_funds (portfolio_id, isin, name, weight) VALUES (?,?,?,?)",
                        (portfolio_id, f["isin"], f.get("name", ""), float(f.get("weight", 0))),
                    )
        return self.get_portfolio(portfolio_id)

    def delete_portfolio(self, portfolio_id: int) -> bool:
        """Elimina una cartera. Devuelve True si existía."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM portfolios WHERE id = ?", (portfolio_id,)
            )
            return cur.rowcount > 0

    def clone_from_live(
        self,
        positions: list[dict],  # [{isin, name, Valor_Actual/weight}]
        name: str = "Copia de Mi Cartera",
        description: str = "",
    ) -> dict[str, Any]:
        """Crea una cartera clonando posiciones actuales del portfolio real.

        Args:
            positions: lista de posiciones (del endpoint /positions o /summary).
            name: nombre para la nueva cartera.
            description: descripción opcional.

        Returns:
            Cartera creada.
        """
        raw_total = sum(p.get("Valor_Actual") or p.get("weight") or 0 for p in positions)
        total = raw_total if raw_total > 0 else 1

        funds = []
        for p in positions:
            isin = p.get("ISIN") or p.get("isin") or ""
            fname = p.get("Fondo") or p.get("name") or isin
            val = p.get("Valor_Actual") or p.get("weight") or 0
            w = float(val) / float(total)
            if isin and w > 0:
                funds.append({"isin": isin, "name": fname, "weight": round(w, 6)})

        # Store the real monetary total so the UI can pre-fill the € investment field
        stored_total = raw_total if raw_total > 0 else 0.0
        return self.create_portfolio(name, funds, description, total_value=stored_total)

    # ── favorites ─────────────────────────────────────────────────────────

    def list_favorites(self) -> list[dict[str, Any]]:
        """Devuelve todos los fondos favoritos."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM favorites ORDER BY added_at DESC"
            ).fetchall()
            return [self._fix_timestamps(dict(r)) for r in rows]

    def add_favorite(
        self, isin: str, name: str = "", notes: str = ""
    ) -> dict[str, Any]:
        """Añade un fondo a favoritos (upsert)."""
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO favorites (isin, name, notes, added_at) VALUES (?,?,?,?) "
                "ON CONFLICT(isin) DO UPDATE SET name=excluded.name, notes=excluded.notes",
                (isin, name, notes, now),
            )
            row = conn.execute(
                "SELECT * FROM favorites WHERE isin = ?", (isin,)
            ).fetchone()
            return self._fix_timestamps(dict(row))

    def remove_favorite(self, isin: str) -> bool:
        """Elimina un fondo de favoritos. Devuelve True si existía."""
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM favorites WHERE isin = ?", (isin,))
            return cur.rowcount > 0

    def is_favorite(self, isin: str) -> bool:
        """Comprueba si un ISIN está en favoritos."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM favorites WHERE isin = ?", (isin,)
            ).fetchone()
            return row is not None

    # ── manual_positions ─────────────────────────────────────────────────

    def list_manual_positions(self) -> list[dict[str, Any]]:
        """Devuelve todas las posiciones manuales guardadas."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM manual_positions ORDER BY isin, added_at ASC"
            ).fetchall()
            return [self._fix_timestamps(dict(r)) for r in rows]

    def add_manual_position(
        self,
        isin: str,
        name: str = "",
        tipo: str = "RV",
        capital_invertido: float | None = None,
        participaciones: float | None = None,
        fecha_compra: str | None = None,
    ) -> dict[str, Any]:
        """Añade una nueva aportación manual (siempre un INSERT, múltiples por ISIN)."""
        now = time.time()
        cap = float(capital_invertido) if capital_invertido is not None else 0.0
        with self._connect() as conn:
            cur = conn.execute(
                """INSERT INTO manual_positions
                       (isin, name, tipo, capital_invertido, participaciones, fecha_compra, added_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (isin, name, tipo, cap, participaciones, fecha_compra, now, now),
            )
            row = conn.execute(
                "SELECT * FROM manual_positions WHERE id = ?", (cur.lastrowid,)
            ).fetchone()
            return self._fix_timestamps(dict(row))

    # Keep for backward compatibility — removes ALL entries for an ISIN
    def delete_manual_position(self, isin: str) -> bool:
        """Elimina todas las posiciones manuales de un ISIN. Devuelve True si existía alguna."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM manual_positions WHERE isin = ?", (isin,)
            )
            return cur.rowcount > 0

    def delete_manual_position_by_id(self, entry_id: int) -> bool:
        """Elimina una aportación manual concreta por su id."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM manual_positions WHERE id = ?", (entry_id,)
            )
            return cur.rowcount > 0

    # ── transaction_overrides ────────────────────────────────────────────

    def list_transaction_overrides(self) -> list[dict[str, Any]]:
        """Devuelve todos los overrides de transacciones guardados."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM transaction_overrides ORDER BY isin, fecha"
            ).fetchall()
            return [self._fix_timestamps(dict(r)) for r in rows]

    def upsert_transaction_override(
        self,
        isin: str,
        fecha: str,
        participaciones: float,
        notes: str = "",
    ) -> dict[str, Any]:
        """Crea o actualiza un override de transacción (upsert por ISIN+fecha).

        El campo ``participaciones`` ya debe tener el signo correcto (negativo
        para reembolsos/traspasos salientes).
        """
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO transaction_overrides
                       (isin, fecha, participaciones, notes, created_at)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(isin, fecha) DO UPDATE SET
                       participaciones=excluded.participaciones,
                       notes=excluded.notes""",
                (isin, fecha, float(participaciones), notes, now),
            )
            row = conn.execute(
                "SELECT * FROM transaction_overrides WHERE isin = ? AND fecha = ?",
                (isin, fecha),
            ).fetchone()
            return self._fix_timestamps(dict(row))

    def delete_transaction_override(self, override_id: int) -> bool:
        """Elimina un override por id."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM transaction_overrides WHERE id = ?", (override_id,)
            )
            return cur.rowcount > 0

    # ── excluded_movements ────────────────────────────────────────────────

    def list_excluded_movements(self) -> list[dict[str, Any]]:
        """Devuelve todos los movimientos excluidos (isin+fecha)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT isin, fecha FROM excluded_movements ORDER BY isin, fecha"
            ).fetchall()
            return [dict(r) for r in rows]

    def exclude_movement(self, isin: str, fecha: str) -> None:
        """Marca un movimiento como excluido (oculto en la lista)."""
        now = time.time()
        with self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO excluded_movements (isin, fecha, created_at) VALUES (?,?,?)",
                (isin, fecha, now),
            )

    def unexclude_movement(self, isin: str, fecha: str) -> bool:
        """Elimina la exclusión de un movimiento. Devuelve True si existía."""
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM excluded_movements WHERE isin = ? AND fecha = ?",
                (isin, fecha),
            )
            return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Singleton helper
# ---------------------------------------------------------------------------

_instance: PersistenceService | None = None


def get_persistence_service() -> PersistenceService:
    """Devuelve la instancia singleton de PersistenceService."""
    global _instance
    if _instance is None:
        _instance = PersistenceService()
    return _instance
