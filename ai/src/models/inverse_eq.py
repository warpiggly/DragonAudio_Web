"""
IA 2 — Generador de filtros EQ (Random Forest multisalida).

Recibe la curva de frecuencias (248 puntos) y genera los parametros de los
filtros biquad que corrigen ese dispositivo. Cada filtro son 3 numeros:
fc_hz (en que frecuencia actua), gain_db (cuanto sube/baja) y q (ancho).

Es el modelo del notebook (StandardScaler + MultiOutputRegressor sobre
RandomForest), empaquetado como clase. El numero de filtros es configurable
(el notebook usaba 7; el plan pide poder ampliarlo).
"""

from __future__ import annotations

from pathlib import Path

import joblib

from ..config import N_FILTERS


class InverseEQ:
    """Envuelve el pipeline de la IA 2 (escalado + RandomForest multisalida)."""

    def __init__(self, n_filters: int = N_FILTERS, n_estimators: int = 50, random_state: int = 42):
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.multioutput import MultiOutputRegressor
        from sklearn.pipeline import Pipeline
        from sklearn.preprocessing import StandardScaler

        self.n_filters = n_filters
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("forest", MultiOutputRegressor(
                RandomForestRegressor(
                    n_estimators=n_estimators, random_state=random_state, n_jobs=-1
                )
            )),
        ])

    def fit(self, X, y) -> "InverseEQ":
        self.pipeline.fit(X, y)
        return self

    def predict(self, X):
        return self.pipeline.predict(X)

    def predict_filters(self, X) -> list[list[dict]]:
        """Predice y empaqueta la salida como lista de filtros legibles.

        Por cada fila de X devuelve una lista de dicts:
            [{"type": "PK", "fc_hz": ..., "gain_db": ..., "q": ...}, ...]
        Este es el formato que mas adelante consumira el ecualizador del frontend.
        """
        preds = self.predict(X)
        salidas = []
        for fila in preds:
            filtros = []
            for f in range(self.n_filters):
                filtros.append({
                    "type": "PK",  # el dataset es ~99% peaking
                    "fc_hz": round(float(fila[f * 3]), 1),
                    "gain_db": round(float(fila[f * 3 + 1]), 2),
                    "q": round(float(fila[f * 3 + 2]), 2),
                })
            salidas.append(filtros)
        return salidas

    def evaluate(self, X_test, y_test) -> dict[str, float]:
        """MAE y R2 promediados sobre las 3*n_filters salidas."""
        from sklearn.metrics import mean_absolute_error, r2_score

        y_pred = self.predict(X_test)
        return {
            "mae": float(mean_absolute_error(y_test, y_pred)),
            "r2": float(r2_score(y_test, y_pred, multioutput="uniform_average")),
        }

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"pipeline": self.pipeline, "n_filters": self.n_filters}, path)

    @classmethod
    def load(cls, path: str | Path) -> "InverseEQ":
        data = joblib.load(path)
        obj = cls.__new__(cls)
        obj.pipeline = data["pipeline"]
        obj.n_filters = data["n_filters"]
        return obj
