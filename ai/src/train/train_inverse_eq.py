"""
Entrena la IA 2 (generador de filtros EQ) y guarda el artefacto .joblib.

Uso:
    python -m ai.src.train.train_inverse_eq

Pasos: carga datos -> split POR DISPOSITIVO -> entrena -> mide MAE/R2 ->
guarda en ai/artifacts/inverse_eq.joblib.
(Random Forest puede tardar varios minutos.)
"""

from __future__ import annotations

from ..config import ARTIFACTS_DIR, N_FILTERS
from ..data.datasets import build_inverse_table, split_by_device
from ..models.inverse_eq import InverseEQ

OUTPUT = ARTIFACTS_DIR / "inverse_eq.joblib"


def main() -> None:
    print("IA 2 — Generador de filtros EQ")
    print("Cargando datos...")
    X, y, groups = build_inverse_table(N_FILTERS)
    print(f"  {len(X)} ejemplos x {X.shape[1]} frecuencias -> {y.shape[1]} salidas "
          f"({N_FILTERS} filtros x 3)")

    X_train, X_test, y_train, y_test = split_by_device(X, y, groups)
    print(f"  train: {len(X_train)}  |  test: {len(X_test)}  (split por dispositivo)")

    print("Entrenando (esto puede tardar)...")
    model = InverseEQ(n_filters=N_FILTERS).fit(X_train, y_train)

    metrics = model.evaluate(X_test, y_test)
    print(f"  MAE: {metrics['mae']:.3f}  |  R2: {metrics['r2']:.3f}")

    model.save(OUTPUT)
    print(f"Guardado en: {OUTPUT}")


if __name__ == "__main__":
    main()
