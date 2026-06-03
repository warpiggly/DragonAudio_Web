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

#Esta es una de las partes mas importantes del codigo, ya que define la estructura del modelo.
# El modelo es un pipeline que primero escala los datos de entrada con StandardScaler y luego aplica un RandomForestRegressor multisalida para predecir los parametros de los filtros EQ. 
# El numero de filtros es configurable, lo que permite adaptar el modelo a diferentes necesidades.
        self.n_filters = n_filters
        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),#pone todos los números en la misma escala (si no, las frecuencias grandes "pesarían" más que las pequeñas).
            ("forest", MultiOutputRegressor(#el envoltorio que permite predecir 21 números de golpe (7 filtros × 3 datos: frecuencia, ganancia, Q), en vez de uno solo.
                RandomForestRegressor(#muchos árboles de decisión votando; predice números, no categorías.
                    n_estimators=n_estimators, random_state=random_state, n_jobs=-1
                )
            )),
        ])

    def fit(self, X, y) -> "InverseEQ":
        self.pipeline.fit(X, y)
        return self

    def predict(self, X):
        return self.pipeline.predict(X)
    
    
#ESTA ES OTRA PARTE IMPORTANTE: Toma la salida cruda del modelo (un array de números) y la convierte en una lista de filtros legibles, con formato dict. 
# Esto es crucial para que el frontend pueda consumir la salida del modelo y aplicarla al ecualizador.

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
