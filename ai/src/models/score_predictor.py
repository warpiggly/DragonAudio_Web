"""
IA 1 — Predictor de mejora de audio (Ridge Regression).

Recibe la curva de frecuencias de un dispositivo (248 puntos) y predice
cuanto mejoraria su score de calidad al aplicarle un EQ (score_delta).
Sirve para saber si vale la pena ecualizar antes de calcular nada.

Es el mismo modelo del notebook (StandardScaler + Ridge(alpha=100)), pero
empaquetado como una clase con fit/predict/save/load para poder entrenarlo
en un script y cargarlo despues desde el backend (sin reescribir nada).
"""

from __future__ import annotations

from pathlib import Path

import joblib


class ScorePredictor:
    """Envuelve el pipeline de la IA 1 (escalado + Ridge)."""

    def __init__(self, alpha: float = 100.0):
        # Import local para no exigir sklearn solo por importar el modulo.
        from sklearn.linear_model import Ridge
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        self.alpha = alpha
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("ridge", Ridge(alpha=alpha)),
        ])

    def fit(self, X, y) -> "ScorePredictor":
        self.pipeline.fit(X, y)
        return self

    def predict(self, X):
        return self.pipeline.predict(X)

    def evaluate(self, X_test, y_test) -> dict[str, float]:
        """Devuelve MAE y R2 (las metricas que pide el plan para la sustentacion)."""
        from sklearn.metrics import mean_absolute_error, r2_score

        y_pred = self.predict(X_test)
        return {
            "mae": float(mean_absolute_error(y_test, y_pred)),
            "r2": float(r2_score(y_test, y_pred)),
        }

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.pipeline, path)

    @classmethod
    def load(cls, path: str | Path) -> "ScorePredictor":
        obj = cls.__new__(cls)        # no re-crea el pipeline vacio
        obj.pipeline = joblib.load(path)
        obj.alpha = obj.pipeline.named_steps["ridge"].alpha
        return obj
