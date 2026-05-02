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

## 5. Feature Engineering
- Each transformation = one independent function or class.
- Use sklearn Pipelines (or equivalent) to chain transformations.
- Document feature importance and selection rationale.

## 6. Modeling & Training
- Separate scripts: model definition, training loop, evaluation.
- Hyperparameter tuning via Optuna or Hyperopt.
- Cross-validation stratified by target variable; temporal validation for time-series.
- Early stopping + checkpointing for long-running training.

## 7. Evaluation & Metrics
- Classification: accuracy, precision, recall, F1-score, ROC-AUC.
- Regression: MAPE, MAE, RMSE, R-squared.
- Always produce visualizations: learning curves, feature importance, residual analysis.

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
