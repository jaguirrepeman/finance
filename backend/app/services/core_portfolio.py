"""
core_portfolio.py — Clase central Portfolio.

Fuente de verdad para la cartera de inversión. Soporta:
  - Carga desde TSV/Excel/CSV (libro de órdenes del broker)
  - Carga desde lista de dicts o dict {ISIN: participaciones}
  - Contabilidad FIFO automática (lotes abiertos, reembolsos parciales)
  - Generación de resumen en DataFrame (una fila por fondo)

Consumido por:
  - client_async.py → AsyncPortfolioCore (posiciones + precios live)
  - tax_calculator.py → TaxOptimizer (usa open_lots de esta clase)
"""

import logging
import os
from typing import Dict, List, Optional, Union

import pandas as pd

logger = logging.getLogger(__name__)


class Portfolio:
    """
    Gestiona la cartera de inversión.

    Attributes:
        open_lots: Lista de lotes abiertos calculados por FIFO.
        positions: Resumen {ISIN: participaciones_restantes}.
    """

    # -------------------------------------------------------------------------
    # Inicialización
    # -------------------------------------------------------------------------

    def __init__(self, source: Union[str, List[Dict], Dict, None] = None) -> None:
        """
        Inicializa el portfolio desde distintas fuentes.

        Args:
            source:
                - str  → ruta a un archivo Excel (.xlsx) o CSV.
                - List[Dict] → posiciones ya calculadas: [{"ISIN": "...", "Participaciones": 100}].
                - Dict → {ISIN: participaciones}.
                - None → portfolio vacío (útil para tests o inicialización diferida).

        Raises:
            ValueError: Si el tipo de `source` no está soportado.
            FileNotFoundError: Si la ruta proporcionada no existe.
        """
        self.open_lots: List[Dict] = []
        self.positions: Dict[str, float] = {}
        self.movements: pd.DataFrame = pd.DataFrame()
        # ISINs identificados como ETFs (no aplica corrección de localización Excel)
        self._etf_isins: set = set()

        if source is None:
            pass  # Portfolio vacío; el llamador puede popularlo manualmente
        elif isinstance(source, str):
            if source.endswith(".tsv"):
                self._load_from_tsv(source)
            elif source.endswith(".csv"):
                self._load_from_broker_csv(source)
            elif source.endswith(".xlsx"):
                self._load_from_excel(source)
            else:
                raise ValueError("Solo se soportan archivos .xlsx, .csv o .tsv")
        elif isinstance(source, list):
            self._load_from_list(source)
        elif isinstance(source, dict):
            self._load_from_dict(source)
        else:
            raise ValueError(
                f"Fuente de datos no soportada: {type(source).__name__}. "
                "Usa str (ruta), list o dict."
            )

    # -------------------------------------------------------------------------
    # Loaders privados
    # -------------------------------------------------------------------------

    @staticmethod
    def _clean_float(value) -> float:
        """Convierte un valor (posiblemente string con formato europeo) a float.

        Soporta separador decimal con coma y separador de miles con punto o coma,
        incluyendo valores como '1,332,135' (→ 1332.135) o '1.332.135' (→ 1332135).
        """
        if pd.isna(value):
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        v = str(value).strip()
        for token in ("€", "EUR", "eur", " "):
            v = v.replace(token, "")
        if "," in v:
            # La última coma es el separador decimal; las anteriores son miles
            integer_part, _, decimal_part = v.rpartition(",")
            v = integer_part.replace(",", "").replace(".", "") + "." + decimal_part
        elif v.count(".") > 1:
            # Varios puntos → separador de miles sin decimal
            v = v.replace(".", "")
        try:
            return float(v)
        except ValueError:
            return 0.0

    @staticmethod
    def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
        """Renombra columnas del Excel a nombres canónicos."""
        col_map: Dict[str, str] = {}
        for col in df.columns:
            c = str(col).lower().strip()
            if "isin" in c:
                col_map[col] = "ISIN"
            elif "fecha" in c:
                col_map[col] = "Fecha"
            elif "importe" in c:
                col_map[col] = "Importe"
            elif "participaciones" in c or "nº" in c or "nâº" in c:
                col_map[col] = "Participaciones"
            elif "estado" in c:
                col_map[col] = "Estado"
            elif "tipo" in c:
                col_map[col] = "Tipo"
            elif "fondo" in c or "nombre" in c or "activo" in c:
                col_map[col] = "Fondo"
        return df.rename(columns=col_map)

    def _load_from_excel(self, filepath: str) -> None:
        """Lee el Excel de órdenes y delega el procesamiento a _process_orders_df."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Archivo no encontrado: {filepath}")
        df = pd.read_excel(filepath)
        self._process_orders_df(df)
        if not self.movements.empty:
            self.movements["Fuente"] = "MyInvestor Fondos"

    def _load_from_broker_csv(self, filepath: str) -> None:
        """Lee el CSV de órdenes del broker (separador ';') y delega a _process_orders_df.

        A diferencia del TSV/Excel, este archivo ya exporta participaciones con
        coma decimal correcta (e.g. "10,404"), por lo que la corrección de
        localización Excel español (dividir enteros por 1000) NO se aplica:
        los valores no enteros la omiten automáticamente en _fix_localization.

        El archivo CSV del broker contiene las columnas:
            - Fecha de la orden   → Fecha
            - ISIN                → ISIN
            - Importe estimado    → Importe (e.g. "1000 EUR")
            - Nº de participaciones → Participaciones (decimal con coma, e.g. "10,404")
            - Estado              → Estado
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Archivo no encontrado: {filepath}")
        df = pd.read_csv(filepath, sep=";", encoding="utf-8", dtype=str)
        self._process_orders_df(df)
        if not self.movements.empty:
            self.movements["Fuente"] = "MyInvestor Fondos"

    def _load_from_tsv(self, filepath: str) -> None:
        """Lee el TSV de órdenes (separado por tabulador) y delega a _process_orders_df.

        El archivo TSV exportado por la plataforma contiene las columnas:
            - Fecha de la orden   → Fecha
            - ISIN                → ISIN
            - Importe estimado    → Importe (e.g. "1000 EUR")
            - Nº de participaciones → Participaciones (decimal con coma, e.g. "89,46")
            - Estado              → Estado
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Archivo no encontrado: {filepath}")
        df = pd.read_csv(filepath, sep="\t", encoding="utf-8", dtype=str)
        self._process_orders_df(df)
        if not self.movements.empty:
            self.movements["Fuente"] = "MyInvestor Fondos"

    def _process_orders_df(self, df: pd.DataFrame) -> None:
        """Normaliza, limpia y aplica reglas de negocio sobre un DataFrame de órdenes.

        El DataFrame debe contener al menos las columnas (tras normalización):
        ISIN, Fecha, Participaciones.  Importe y Estado son opcionales pero
        mejoran la calidad de los cálculos.

        Nota de localización:
            Excel en español puede exportar 5.317 (= 5,317 participaciones) como
            el entero 5317. Si el NAV implícito resultante es < 5 €, se divide
            por 1000 para corregirlo automáticamente.
        """
        df = self._normalize_columns(df)

        # Filtrar solo órdenes ejecutadas
        df = df.loc[lambda x: x.Estado == "Finalizada"]

        # Limpiar tipos — _clean_float maneja comas decimales y sufijos "EUR"
        df["Participaciones"] = df["Participaciones"].apply(self._clean_float)
        if "Importe" in df.columns:
            df["Importe"] = df["Importe"].apply(self._clean_float)

        df["Fecha"] = pd.to_datetime(df["Fecha"], dayfirst=True)

        # Estandarizar ISIN
        df_isin = df["ISIN"].astype(str).str.strip().str.upper()
        df["ISIN"] = df_isin

        # Los reembolsos/traspasos se corrigen vía transaction_overrides en SQLite
        # (gestionados desde la UI → ya no hay reglas hardcodeadas aquí).

        df = df.sort_values("Fecha").reset_index(drop=True)
        self.movements = df.copy()

        for isin, group in df.groupby("ISIN"):
            isin_str = str(isin).strip()
            if isin_str in ("nan", ""):
                continue
            self._apply_fifo(isin_str, group)

    def filter_excluded_movements(self, excluded: list[dict]) -> None:
        """Elimina movimientos excluidos por el usuario y recalcula FIFO.

        Args:
            excluded: lista de dicts con {isin, fecha (YYYY-MM-DD)}.
        """
        if not excluded or self.movements.empty:
            return
        excluded_set = {
            (str(e["isin"]).strip().upper(), str(e["fecha"]).strip()[:10])
            for e in excluded
        }
        before = len(self.movements)
        mask = self.movements.apply(
            lambda row: (
                str(row["ISIN"]).strip().upper(),
                row["Fecha"].strftime("%Y-%m-%d") if hasattr(row["Fecha"], "strftime") else str(row["Fecha"])[:10],
            ) not in excluded_set,
            axis=1,
        )
        self.movements = self.movements.loc[mask].reset_index(drop=True)
        removed = before - len(self.movements)
        if removed:
            logger.info("Filtered out %d excluded movements", removed)
            # Recalculate FIFO from scratch
            self.open_lots = []
            self.positions = {}
            df_sorted = self.movements.sort_values("Fecha")
            for isin, group in df_sorted.groupby("ISIN"):
                isin_str = str(isin).strip()
                if isin_str in ("nan", ""):
                    continue
                self._apply_fifo(isin_str, group)

    def apply_sign_overrides(self, overrides: List[Dict]) -> None:
        """Aplica overrides de signos desde SQLite y recalcula FIFO.

        Llamado después de la carga inicial para aplicar correcciones
        de signo que el usuario ha guardado desde la interfaz web.

        Semántica del campo ``participaciones``:
          - Valor != 0 → reemplaza directamente el valor de la fila coincidente.
          - Valor == 0 → modo "negar todos los positivos": convierte en negativas
            todas las filas positivas que coinciden con ISIN+fecha.  Útil cuando
            hay varias transacciones el mismo día (ej. dos reembolsos) y no se
            puede almacenar dos overrides para la misma clave ISIN+fecha.

        Args:
            overrides: lista de dicts con {isin, fecha (YYYY-MM-DD), participaciones}.
        """
        if not overrides or self.movements.empty:
            return
        modified = False
        for ov in overrides:
            isin_ov = str(ov.get("isin", "")).strip().upper()
            fecha_ov = str(ov.get("fecha", "")).strip()[:10]  # YYYY-MM-DD
            participaciones_ov = float(ov.get("participaciones", 0))
            mask = (
                (self.movements["ISIN"] == isin_ov)
                & (self.movements["Fecha"].dt.strftime("%Y-%m-%d") == fecha_ov)
            )
            if mask.any():
                if participaciones_ov == 0.0:
                    # Modo "negar todos los positivos" en esta fecha
                    pos_mask = mask & (self.movements["Participaciones"] > 0)
                    self.movements.loc[pos_mask, "Participaciones"] = (
                        -self.movements.loc[pos_mask, "Participaciones"].abs()
                    )
                    logger.info(
                        "Override (negar positivos) aplicado: %s %s — %d filas negadas",
                        isin_ov, fecha_ov, int(pos_mask.sum()),
                    )
                else:
                    self.movements.loc[mask, "Participaciones"] = participaciones_ov
                    logger.info(
                        "Override aplicado: %s %s → %+.4f participaciones",
                        isin_ov, fecha_ov, participaciones_ov,
                    )
                modified = True
            else:
                logger.warning(
                    "Override no encontrado en movements: %s %s", isin_ov, fecha_ov
                )
        if modified:
            # Recalcular FIFO desde cero con los movimientos corregidos
            self.open_lots = []
            self.positions = {}
            df_sorted = self.movements.sort_values("Fecha")
            for isin, group in df_sorted.groupby("ISIN"):
                isin_str = str(isin).strip()
                if isin_str in ("nan", ""):
                    continue
                self._apply_fifo(isin_str, group)

    @staticmethod
    def _fix_localization(units: float, amount: float) -> float:
        """Corrige el bug de localización de Excel español.

        Excel puede exportar 5,317 como el entero 5317 (elimina la coma
        decimal). El ÚNICO indicador fiable es que el valor sea entero:
        _clean_float ya convirtió comas europeas a puntos, así que
        cualquier entero restante es un artefacto de localización.

        Los valores no-enteros ya son correctos tras el parseo.
        """
        if units % 1 == 0:  # integer → localization artifact → divide by 1000
            return units / 1000.0
        return units  # non-integer → already correct after _clean_float

    def _apply_fifo(self, isin: str, group: pd.DataFrame) -> None:
        """Aplica contabilidad FIFO a las transacciones de un ISIN."""
        purchases: List[Dict] = []

        for _, row in group.iterrows():
            units: float = row.get("Participaciones", 0.0)
            amount: float = row.get("Importe", 0.0)
            is_sale = False

            if "Tipo" in row:
                tipo = str(row["Tipo"]).lower()
                if "venta" in tipo or "reembolso" in tipo:
                    is_sale = True

            if units < 0:
                is_sale = True
                units = abs(units)

            # Corrección de localización Excel español (aplica a compras Y ventas)
            # Para ETFs las participaciones son enteros reales — no aplicar.
            # original_units = units
            if isin not in self._etf_isins:
                units = self._fix_localization(units, amount)
            # if units != original_units:
            #     logger.debug(
            #         "Corrección de localización para ISIN %s: %.4f → %.4f participaciones",
            #         isin, original_units, units,
            #     )

            if not is_sale and units > 0:
                purchases.append({
                    "ISIN": isin,
                    "Fondo": row.get("Fondo", isin),
                    "Fecha": row["Fecha"],
                    "Participaciones_Iniciales": units,
                    "Participaciones_Restantes": units,
                    "Importe_Invertido": amount,
                    "Precio_Compra_Unitario": (amount / units) if units > 0 else 0.0,
                })

            elif is_sale and units > 0:
                units_to_sell = units
                for lot in purchases:
                    if lot["Participaciones_Restantes"] <= 0:
                        continue
                    if lot["Participaciones_Restantes"] >= units_to_sell:
                        lot["Participaciones_Restantes"] -= units_to_sell
                        units_to_sell = 0.0
                        break
                    else:
                        units_to_sell -= lot["Participaciones_Restantes"]
                        lot["Participaciones_Restantes"] = 0.0

                if units_to_sell > 0.001:
                    logger.warning(
                        "ISIN %s: se intentaron vender %.4f participaciones de más (sin lote suficiente).",
                        isin, units_to_sell,
                    )

        # Guardar lotes con saldo positivo
        for lot in purchases:
            if lot["Participaciones_Restantes"] > 0.0001:
                self.open_lots.append(lot)

        remaining = sum(l["Participaciones_Restantes"] for l in purchases)
        if remaining > 0.0001:
            self.positions[isin] = remaining

    # -------------------------------------------------------------------------
    # Loaders para fuentes externas de ETFs
    # -------------------------------------------------------------------------

    @staticmethod
    def _normalize_myinvestor_etf_df(filepath: str) -> pd.DataFrame:
        """Lee el Excel de MyInvestor ETF y lo normaliza al formato canónico.

        Columnas de entrada: FECHA, ISIN, Titulos, Precio, Comision, Importe_Neto.
        Columnas de salida:  ISIN, Fecha, Participaciones, Importe, Estado, Tipo, Fondo.
        """
        import shutil, tempfile, os
        # Copiar a temp para evitar bloqueos de OneDrive/Excel
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            shutil.copy2(filepath, tmp_path)
            df = pd.read_excel(tmp_path)
        finally:
            try:
                os.remove(tmp_path)
            except OSError:
                pass

        df = df.rename(columns={
            "FECHA": "Fecha",
            "Titulos": "Participaciones",
            "Importe_Neto": "Importe",
        })
        df["ISIN"] = df["ISIN"].astype(str).str.strip().str.upper()
        df["Participaciones"] = df["Participaciones"].astype(float)
        df["Importe"] = df["Importe"].abs().astype(float)
        df["Estado"] = "Finalizada"
        df["Tipo"] = "Compra"
        df["Fondo"] = df["ISIN"]  # nombre desconocido; usar ISIN
        df["Fuente"] = "MyInvestor ETFs"

        # Corregir años claramente incorrectos (ej. 2925 → 2025)
        df["Fecha"] = pd.to_datetime(df["Fecha"], errors="coerce")
        mask_bad_year = df["Fecha"].dt.year > 2100
        if mask_bad_year.any():
            df.loc[mask_bad_year, "Fecha"] = df.loc[mask_bad_year, "Fecha"].apply(
                lambda d: d.replace(year=d.year - 900) if pd.notna(d) else d
            )
            logger.warning(
                "MyInvestorETF: corregidos %d registros con año erróneo (>2100)",
                mask_bad_year.sum(),
            )

        return df[["ISIN", "Fecha", "Participaciones", "Importe", "Estado", "Tipo", "Fondo", "Fuente"]]

    @staticmethod
    def _normalize_traderepublic_df(filepath: str) -> pd.DataFrame:
        """Lee el CSV de TradeRepublic, filtra la categoría TRADING y normaliza.

        Columnas de entrada: date, symbol, shares, amount, type, category, name.
        Columnas de salida:  ISIN, Fecha, Participaciones, Importe, Estado, Tipo, Fondo.
        """
        df = pd.read_csv(filepath, sep=None, engine="python")
        df = df[df["category"] == "TRADING"].copy()
        if df.empty:
            return pd.DataFrame(columns=["ISIN", "Fecha", "Participaciones", "Importe", "Estado", "Tipo", "Fondo", "Fuente"])

        df = df.rename(columns={
            "date": "Fecha",
            "symbol": "ISIN",
            "shares": "Participaciones",
            "amount": "Importe",
            "name": "Fondo",
            "type": "Tipo",
        })
        df["Fecha"] = pd.to_datetime(df["Fecha"], errors="coerce")
        df["Importe"] = df["Importe"].abs().astype(float)
        df["Estado"] = "Finalizada"
        # TradeRepublic usa BUY/SELL; traducir a Compra/Venta
        df["Tipo"] = df["Tipo"].map({"BUY": "Compra", "SELL": "Venta"}).fillna("Compra")
        df["ISIN"] = df["ISIN"].astype(str).str.strip().str.upper()

        # Participaciones: negativas para ventas (mismo formato que TSV de MyInvestor)
        df["Participaciones"] = df["Participaciones"].astype(float).abs()
        sell_mask = df["Tipo"] == "Venta"
        df.loc[sell_mask, "Participaciones"] = -df.loc[sell_mask, "Participaciones"]

        # Usar ISIN como nombre de fondo cuando el campo está vacío o es NaN
        df["Fondo"] = df["Fondo"].where(df["Fondo"].notna() & (df["Fondo"].astype(str).str.strip() != ""), df["ISIN"])
        df["Fuente"] = "Trade Republic ETFs"

        return df[["ISIN", "Fecha", "Participaciones", "Importe", "Estado", "Tipo", "Fondo", "Fuente"]]

    def load_extra_orders(self, df: pd.DataFrame, etf_isins: Optional[set] = None) -> None:
        """Incorpora órdenes adicionales (ya normalizadas) a la cartera.

        Las órdenes se añaden a ``self.movements`` respetando el orden temporal
        global y se aplica FIFO incremental sobre los ISINs nuevos.

        Args:
            df: DataFrame normalizado con columnas
                [ISIN, Fecha, Participaciones, Importe, Estado, Tipo, Fondo].
            etf_isins: ISINs que NO deben sufrir la corrección de localización.
        """
        if etf_isins:
            self._etf_isins.update(etf_isins)

        df = df[df["Estado"] == "Finalizada"].copy()
        if df.empty:
            return

        df = df.sort_values("Fecha").reset_index(drop=True)

        if not self.movements.empty:
            self.movements = (
                pd.concat([self.movements, df], ignore_index=True)
                .sort_values("Fecha")
                .reset_index(drop=True)
            )
        else:
            self.movements = df.copy()

        for isin, group in df.groupby("ISIN"):
            isin_str = str(isin).strip()
            if isin_str in ("nan", ""):
                continue
            self._apply_fifo(isin_str, group)

    def _load_from_list(self, data: List[Dict]) -> None:
        """Carga posiciones simples desde una lista de dicts [{ISIN, Participaciones}]."""
        for item in data:
            isin = item.get("ISIN")
            if isin:
                units = item.get("Participaciones", item.get("Peso", 0))
                self.positions[str(isin)] = float(units)

    def _load_from_dict(self, data: Dict) -> None:
        """Carga posiciones desde un dict {ISIN: participaciones}."""
        for isin, units in data.items():
            self.positions[str(isin)] = float(units)

    # -------------------------------------------------------------------------
    # API pública — accesores simples
    # -------------------------------------------------------------------------

    def get_open_lots(self) -> List[Dict]:
        """Devuelve la lista de lotes FIFO abiertos."""
        return self.open_lots

    def get_total_invested(self) -> float:
        """Calcula el capital total invertido (suma de importes de lotes abiertos)."""
        return sum(lot["Importe_Invertido"] for lot in self.open_lots)

    def get_current_valuation(self, live_prices: Dict[str, float]) -> float:
        """
        Calcula el valor actual de la cartera con precios en vivo.

        Args:
            live_prices: {ISIN: precio_actual}.

        Returns:
            Valor total en la misma moneda que live_prices.
        """
        return sum(
            units * live_prices.get(isin, 0.0)
            for isin, units in self.positions.items()
        )

    # -------------------------------------------------------------------------
    # API pública — DataFrame de resumen (una fila por fondo)
    # -------------------------------------------------------------------------

    def to_dataframe(self, live_prices: Optional[Dict[str, float]] = None) -> pd.DataFrame:
        """
        Devuelve la cartera como un DataFrame con una fila por fondo.

        Columnas garantizadas:
            - ISIN
            - Fondo          (nombre del fondo; usa ISIN si no hay nombre disponible)
            - Participaciones (unidades en cartera)
            - Precio_Compra_Medio (coste medio ponderado de adquisición)
            - Capital_Invertido   (suma de importes de lotes abiertos)
            - Precio_Actual       (de live_prices si se proporcionan; NaN si no)
            - Valor_Actual        (Participaciones × Precio_Actual; NaN si no hay precio)
            - Ganancia_Euros      (Valor_Actual − Capital_Invertido)
            - Ganancia_Pct        (rentabilidad total en %)

        Args:
            live_prices: {ISIN: precio_actual}. Si es None, las columnas de
                         valoración quedarán a NaN.

        Returns:
            pd.DataFrame ordenado de mayor a menor Capital_Invertido.
        """
        if not self.positions:
            return pd.DataFrame(columns=[
                "ISIN", "Fondo", "Participaciones", "Precio_Compra_Medio",
                "Capital_Invertido", "Precio_Actual", "Valor_Actual",
                "Ganancia_Euros", "Ganancia_Pct",
            ])

        # Agregar lotes por ISIN
        aggregated: Dict[str, Dict] = {}
        for lot in self.open_lots:
            isin = lot["ISIN"]
            if isin not in aggregated:
                aggregated[isin] = {
                    "ISIN": isin,
                    "Fondo": lot.get("Fondo", isin),
                    "Participaciones": 0.0,
                    "Capital_Invertido": 0.0,
                }
            aggregated[isin]["Participaciones"] += lot["Participaciones_Restantes"]
            aggregated[isin]["Capital_Invertido"] += (
                lot["Participaciones_Restantes"] * lot["Precio_Compra_Unitario"]
            )

        # Incluir posiciones que vienen de _load_from_list / _load_from_dict
        # (no tienen lotes, por lo que no aparecen en aggregated)
        for isin, units in self.positions.items():
            if isin not in aggregated:
                aggregated[isin] = {
                    "ISIN": isin,
                    "Fondo": isin,
                    "Participaciones": units,
                    "Capital_Invertido": 0.0,
                }

        rows = []
        for isin, data in aggregated.items():
            parts = data["Participaciones"]
            capital = data["Capital_Invertido"]
            precio_medio = (capital / parts) if parts > 0 else 0.0

            precio_actual = live_prices.get(isin) if live_prices else None
            # Fallback: si el precio live es 0 o None, usar el precio medio de compra
            precio_valoracion = precio_actual if precio_actual else (precio_medio if precio_medio > 0 else None)
            valor_actual = (parts * precio_valoracion) if precio_valoracion is not None else None
            ganancia_euros = (valor_actual - capital) if valor_actual is not None else None
            ganancia_pct = (
                ((valor_actual / capital) - 1) * 100
                if valor_actual is not None and capital > 0
                else None
            )

            rows.append({
                "ISIN": isin,
                "Fondo": data["Fondo"],
                "Participaciones": round(parts, 6),
                "Precio_Compra_Medio": round(precio_medio, 4),
                "Capital_Invertido": round(capital, 2),
                "Precio_Actual": precio_actual,
                "Valor_Actual": round(valor_actual, 2) if valor_actual is not None else None,
                "Ganancia_Euros": round(ganancia_euros, 2) if ganancia_euros is not None else None,
                "Ganancia_Pct": round(ganancia_pct, 2) if ganancia_pct is not None else None,
            })

        df = pd.DataFrame(rows).sort_values("Capital_Invertido", ascending=False)
        df = df.reset_index(drop=True)
        return df

    # -------------------------------------------------------------------------
    # Representación
    # -------------------------------------------------------------------------

    def __repr__(self) -> str:
        return (
            f"Portfolio("
            f"fondos={len(self.positions)}, "
            f"lotes={len(self.open_lots)}, "
            f"capital_invertido={self.get_total_invested():.2f}€)"
        )
