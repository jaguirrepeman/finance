"""
core_portfolio.py — Clase central Portfolio.

Fuente de verdad para la cartera de inversión. Soporta:
  - Carga desde Excel (libro de órdenes)
  - Carga desde lista de dicts o dict {ISIN: participaciones}
  - Contabilidad FIFO automática (lotes abiertos)
  - Generación de resumen en DataFrame (una fila por fondo)

Dependencias activas:
  - functions_fund.py  → clase Fund (precios live, datos Morningstar)
  - tax_calculator.py  → TaxOptimizer (usa open_lots de esta clase)
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

        if source is None:
            pass  # Portfolio vacío; el llamador puede popularlo manualmente
        elif isinstance(source, str):
            if not (source.endswith(".xlsx") or source.endswith(".csv")):
                raise ValueError("Solo se soportan archivos .xlsx o .csv")
            self._load_from_excel(source)
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
        """Convierte un valor (posiblemente string con formato europeo) a float."""
        if pd.isna(value):
            return 0.0
        if isinstance(value, (int, float)):
            return float(value)
        v = str(value).replace("€", "").replace("EUR", "").replace("eur", "").replace(" ", "").strip()
        if "." in v and "," in v:
            # Determina cuál es el separador decimal por su posición
            v = v.replace(".", "").replace(",", ".") if v.rfind(",") > v.rfind(".") else v.replace(",", "")
        elif "," in v:
            v = v.replace(",", ".")
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
        """
        Lee el Excel de órdenes, aplica reglas de negocio y calcula lotes FIFO.

        El Excel debe contener al menos las columnas: ISIN, Fecha, Participaciones.
        La columna Importe es opcional pero necesaria para calcular el precio unitario.

        Nota de localización:
            Excel en español puede exportar 5.317 (= 5,317 participaciones) como
            el entero 5317. Si el NAV implícito resultante es < 5 €, se divide
            por 1000 para corregirlo automáticamente.
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Archivo no encontrado: {filepath}")

        df = pd.read_excel(filepath)
        df = self._normalize_columns(df)

        # Filtrar solo órdenes ejecutadas
        if "Estado" in df.columns:
            valid_states = {"ejecutada", "completada", "procesada", "finalizada", "ok"}
            df = df[df["Estado"].astype(str).str.lower().str.strip().isin(valid_states)]

        # Limpiar tipos
        df["Participaciones"] = df["Participaciones"].apply(self._clean_float)
        if "Importe" in df.columns:
            df["Importe"] = df["Importe"].apply(self._clean_float)

        df["Fecha"] = pd.to_datetime(df["Fecha"])
        df = df.sort_values("Fecha")

        for isin, group in df.groupby("ISIN"):
            isin_str = str(isin).strip()
            if isin_str in ("nan", ""):
                continue
            self._apply_fifo(isin_str, group)

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

            if not is_sale and units > 0:
                # Corrección del bug de localización de Excel español:
                # 5.317 participaciones → leído como entero 5317 → NAV implícito irreal
                if amount > 0 and units >= 1000 and (units % 1 == 0):
                    if (amount / units) < 5.0:
                        units /= 1000.0
                        logger.debug("Corrección de localización aplicada para ISIN %s: %s participaciones", isin, units)

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

    def get_positions(self) -> pd.DataFrame:
        """
        Devuelve un DataFrame con las posiciones activas:
        ISIN, Fondo, Participaciones, Valor_Euros, Fecha_Valoracion
        """
        from app.services.functions_fund import Fund
        
        rows = []
        for isin, units in self.positions.items():
            try:
                # Usamos modo light para no tardar demasiado
                fund = Fund(isin=isin, mode="light", use_cache=True)
                df_fund = fund.fund_data
                
                nombre = isin
                precio = 0.0
                fecha = None
                
                if df_fund is not None and not df_fund.empty:
                    nombre = df_fund['nombre'].iloc[0]
                    data_col = df_fund['data'].iloc[0]
                    if isinstance(data_col, pd.DataFrame):
                        precio = float(data_col.get('precio_actual', [0.0])[0])
                        fecha = data_col.get('fecha_actualizacion', [None])[0]
                
                valor_eur = units * precio
                
                rows.append({
                    "ISIN": isin,
                    "Fondo": nombre,
                    "Participaciones": units,
                    "Valor_Euros": round(valor_eur, 2),
                    "Fecha_Valoracion": fecha
                })
            except Exception as e:
                logger.error("Error obteniendo datos para %s: %s", isin, e)
                rows.append({
                    "ISIN": isin,
                    "Fondo": isin,
                    "Participaciones": units,
                    "Valor_Euros": 0.0,
                    "Fecha_Valoracion": None
                })
                
        if not rows:
            return pd.DataFrame(columns=["ISIN", "Fondo", "Participaciones", "Valor_Euros", "Fecha_Valoracion"])
            
        return pd.DataFrame(rows).sort_values("Valor_Euros", ascending=False).reset_index(drop=True)

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
            valor_actual = (parts * precio_actual) if precio_actual is not None else None
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
