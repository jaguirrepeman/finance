# Copilot Instructions -- DS/ML Project

## Project Context
This is a Python data science / ML project.
- Stack: Poetry, pytest, GitHub Actions.
- Runtime: Python 3.12+
- Formatting & Linting: Ruff (line-length=88, replaces black/isort/flake8)
- Pre-commit hooks: ruff, sqlfluff, cspell (en+es), nb-clean
- Documentation: Sphinx + Napoleon (Google Style docstrings)

## 1. Code Standards (PEP 8 + Team Rules)
- Strictly follow PEP 8, enforced by Ruff.
- Type hints mandatory on all public function signatures (PEP 604 style: `str | None`).
- Google Style docstrings for every public function, class, and module.
- Naming: `snake_case` (functions/variables), `PascalCase` (classes), `UPPER_SNAKE_CASE` (constants).
- DRY principle: extract reusable logic into functions or classes -- no copy-paste.
- Single Responsibility Principle: each module (.py) has one clear purpose.
- No magic numbers or assumptions -- if something is unclear, ask the user.
- Use `pathlib.Path` over `os.path`.
- Use `dataclass(frozen=True)` for immutable value objects / DTOs.
- Prefer composition over inheritance.
- Logging via `structlog` or `logging`, never `print()`.
- All SQL uses parameterized queries -- no f-string interpolation.

## 2. Project Structure (src/ layout)
All projects use the `src/` layout with `pyproject.toml`:

  project/
  |- src/<package_name>/   # All production code here
  |- tests/                # pytest tests (mirror src/ structure)
  |- notebooks/            # Exploration only -- not production
  |- configs/              # YAML/JSON configuration files
  |- docs/                 # Sphinx source files
  |- .github/              # CI workflows, copilot-instructions.md
  |- pyproject.toml
  |- poetry.lock

Key rules:
- Code always under `src/<package_name>/` -- prevents accidental local imports.
- Organize sub-packages by responsibility (e.g. `data/`, `features/`, `models/`, `utils/`).
- Tests mirror `src/` -- `tests/unit/test_engine.py` tests `src/pkg/core/engine.py`.
- Notebooks are for exploration only -- extract production code into `src/`.

## 3. Data Management
- NEVER modify files in data/raw/ -- raw data is immutable.
- Document lineage: raw -> processed -> features.
- Large data files are excluded via .gitignore (use DVC or Git LFS if versioning is needed).
- Use schema validation (Pandera, Great Expectations, or Pydantic) at ingestion boundaries.
- Credentials and connection strings come from environment variables (.env) or GitHub Secrets -- never hardcoded.

## 4. Reproducibility
- Set random seeds for all stochastic processes: `RANDOM_STATE = 42`.
- Track experiments with MLflow, Weights & Biases, or structured logs.
- Configuration files (YAML/Hydra) for hyperparameters -- never hardcode them.
- Notebooks are for exploration only -- extract production code into src/.


## 8. Testing
- Framework: pytest with fixtures in conftest.py.
- Coverage target: >= 80%.
- Naming: test_{function}_{scenario}_{expected}.
- Use pytest.raises for exception testing, pytest.approx for float comparisons.
- At least one happy path, one edge case, one error case per function.

## 9. Performance
- Use vectorized operations (NumPy/Pandas) over loops.
- Profile with cProfile or line_profiler before optimizing.
- Chunking for large datasets; parallel processing with joblib when needed.

## 10. Do NOT
- Use `pickle` for serialization (use joblib, ONNX, or format-specific serializers).
- Use mutable default arguments (`def f(x=[])`).
- Commit .env files or hardcode credentials.
- Use `from module import *`.
- Put production logic in notebooks.
- Leave `print()` statements in committed code.

## 11. Notebook / App Contract (Portfolio Tracker)

This project follows a **thin-notebook / thick-backend** pattern:

```
  FastAPI backend (app/)          ← toda la lógica de negocio
       │
  PortfolioClient (client.py)     ← fachada Python; todos los métodos devuelven DataFrame
       │
  Notebooks (notebooks/*.ipynb)   ← sugar sintáctico sobre PortfolioClient; solo viz/exploración
```

### Reglas de oro

1. **Toda lógica de cálculo (métricas, transformaciones, filtros) vive en `app/`.**  
   Los notebooks solo llaman métodos de `PortfolioClient` y renderizan resultados.

2. **Cada método de `PortfolioClient` tiene su endpoint equivalente en `endpoints.py`.**  
   Si añades `client.foo()` también debes añadir `GET /api/foo`.

3. **Los notebooks son la "demo interactiva" del API**, no una copia.  
   El código del notebook debe verse así:
   ```python
   df = client.evolution_metrics(years=5)   # toda la lógica en client.py
   # … solo visualización a partir de aquí …
   ```

4. **Cuando el notebook muestre comportamiento nuevo** (p. ej. una nueva columna,  
   un nuevo orden, un nuevo cálculo), **ese comportamiento debe reflejarse primero  
   en `client.py` / `endpoints.py`** y el notebook simplemente consumirlo.

5. **Nunca duplicar lógica de negocio** entre el notebook y el backend:  
   DRY se aplica también entre capas.

6. **Orden de desarrollo preferido:**  
   `services/` → `client.py` → `endpoints.py` → `notebook` (visualización).

7. **Actualización del dashboard**
   <!-- Cada vez que toques components.js, actualizas el jsx. -->
   Cada vez que toques los componentes del frontend, haz un rebuild con npm.cmd run build

8. **Consistencia entre notebooks y endpoints**
   Si añades un nuevo endpoint, haz un ejemplo en el notebook. Si añades una nueva métrica, hazla visible en el notebook. El notebook es la demo de tu API, no lo dejes obsoleto.

9. **English teacher**
   Corrige la ortografía y gramática de mis inputs en el chat, y si algo no está claro, haz preguntas de aclaración antes de escribir código. Quiero acostumbrarme a escribir bien. 