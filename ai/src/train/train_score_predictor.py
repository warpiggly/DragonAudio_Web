"""
Entrena la IA 1 (predictor de mejora) y guarda el artefacto .joblib.

Uso:
    python -m ai.src.train.train_score_predictor

Pasos: carga datos -> split POR DISPOSITIVO -> entrena -> mide MAE/R2 ->
guarda en ai/artifacts/score_predictor.joblib.
"""

from __future__ import annotations

from ..config import ARTIFACTS_DIR
from ..data.datasets import build_score_table, split_by_device
from ..models.score_predictor import ScorePredictor

OUTPUT = ARTIFACTS_DIR / "score_predictor.joblib"


def main() -> None:
    print("IA 1 — Predictor de mejora de audio")
    print("Cargando datos...")
    X, y, groups = build_score_table()
    print(f"  {len(X)} ejemplos x {X.shape[1]} frecuencias")

    X_train, X_test, y_train, y_test = split_by_device(X, y, groups)
    print(f"  train: {len(X_train)}  |  test: {len(X_test)}  (split por dispositivo)")

    print("Entrenando...")
    model = ScorePredictor().fit(X_train, y_train)

    metrics = model.evaluate(X_test, y_test)
    print(f"  MAE: {metrics['mae']:.3f} puntos  |  R2: {metrics['r2']:.3f}")

    model.save(OUTPUT)
    print(f"Guardado en: {OUTPUT}")


if __name__ == "__main__":
    main()
