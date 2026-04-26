# Plan de Implementación: Reestructuración del Portfolio Tracker

El objetivo es simplificar la arquitectura actual, centrar la fuente de verdad en el archivo Excel de Órdenes, mejorar drásticamente el rendimiento de las consultas de datos y añadir un optimizador fiscal para retiradas de fondos.

## Arquitectura Propuesta

Actualmente, el código está disperso en múltiples scripts (`transaction_parser.py`, `portfolio.py`, `functions_fund.py`, `finect_scraper.py`). La nueva arquitectura será orientada a objetos, más limpia y centralizada.

### 1. Clase Principal `Portfolio`
Se creará una clase `Portfolio` que actuará como el núcleo del sistema.
- **Fuente de verdad:** Leerá directamente el archivo `Ordenes.xlsx` al instanciarse.
- **Contabilidad FIFO (First-In, First-Out):** Procesará todas las transacciones (compras y ventas) cronológicamente. Cuando haya una venta, descontará las participaciones de las compras más antiguas (ley española).
- **Lotes Abiertos (Open Lots):** Mantendrá un registro detallado de cada "lote" de participaciones que posees (fecha de compra, participaciones restantes, precio de compra). Esto es fundamental para calcular la rentabilidad real y los impuestos.

### 2. Acceso a Datos de Fondos (Dos Modos)
La obtención de datos actual es muy lenta porque intenta descargar toda la información (ratios, holdings, scrapers) en cada ejecución. 
Propongo abandonar/reducir el scraper de Finect (que es propenso a fallos) y optimizar el uso de `mstarpy` y `yfinance`.

Se implementarán dos modos en el actualizador de precios:
- **Modo Ligero (Light Mode):** Solo consultará el NAV (Valor Liquidativo) más reciente. 
  - Usará el endpoint rápido de `mstarpy` (`mstarpy.Funds.nav()`) pidiendo solo los últimos 5 días, o `yfinance` para ETFs. 
  - Tiempo de ejecución estimado: 1-2 segundos por fondo.
- **Modo Detalle (Detailed Mode):** Descargará la composición, sectores, riesgo, etc. 
  - Se guardará en caché (JSON/Pickle).
  - Solo se ejecutará bajo demanda (ej. 1 vez al mes o si el usuario lo pide).

### 3. Calculadora y Optimizador Fiscal (Legislación Española)
Se creará un módulo `TaxOptimizer`.
- **Reglas Fiscales (2024/2026):** Aplicará los tramos del ahorro (19% hasta 6k, 21% hasta 50k, 23% hasta 200k, 27% hasta 300k, 28% más de 300k).
- **Minimización de Impuestos:** Si quieres retirar `X` cantidad de dinero, el algoritmo analizará todos tus "Lotes Abiertos" en todos tus fondos.
- **Estrategia:** Priorizará vender aquellos lotes que estén en pérdidas (para compensar) o que tengan la menor ganancia patrimonial porcentual. De esta forma, consigues el efectivo que necesitas tributando lo mínimo posible.

---

> [!IMPORTANT]
> **Revisión del Usuario Requerida**
> 1. ¿Estás de acuerdo con eliminar o dejar de usar `finect_scraper.py` para depender de `mstarpy` y simplificar el código?
> 2. ¿Quieres que la calculadora de impuestos devuelva un plan de ventas que mezcle fondos (vender un poco del Fondo A y un poco del B) para minimizar al máximo, o prefieres que sugiera el mejor fondo único para vender?

## Cambios Propuestos en Archivos

### [NEW] `backend/app/services/core_portfolio.py`
Contendrá la clase `Portfolio` y la lógica FIFO de lectura del Excel. Reemplazará gran parte de `transaction_parser.py` y `portfolio.py`.

### [MODIFY] `backend/app/services/functions_fund.py`
Se refactorizará para implementar el `Light Mode` y `Detailed Mode`. Se eliminarán dependencias pesadas innecesarias y se limpiará el código espagueti.

### [NEW] `backend/app/services/tax_calculator.py`
Contendrá el algoritmo de optimización de rescates. Recibirá un objeto `Portfolio`, una cantidad objetivo (ej. 10.000€) y devolverá un plan de ventas detallando qué vender, de qué fondos, la ganancia patrimonial que aflora y el impuesto estimado a pagar.

### [DELETE] `backend/app/services/finect_scraper.py`
*(Opcional, sujeto a tu aprobación)*. Dado que `mstarpy` ya provee la inmensa mayoría de datos estructurados de forma más fiable que el scraping web.

---

## Plan de Verificación
1. **Prueba de Parsing:** Instanciar `Portfolio('Ordenes.xlsx')` y verificar que el número total de participaciones por ISIN coincide con el estado actual.
2. **Prueba de Rendimiento:** Ejecutar el *Light Mode* y comprobar que tarda solo unos segundos en actualizar toda la cartera.
3. **Prueba Fiscal:** Simular un rescate de 5.000€ y comprobar matemáticamente que el algoritmo elige los lotes con menor plusvalía, aplicando correctamente el método FIFO.
