"""
Servicio de inferencia: convierte un test guardado en las ganancias del EQ.

Encadena las 3 piezas que ya viven en ai/src/:
    test (claridad 0-10)  -> audiometry.clarity_to_curve  -> curva 248 pts
                          -> InverseEQ (IA 2)             -> filtros biquad
                          -> eq_bridge.filters_to_eq_gains -> 9 ganancias

El modelo .joblib se carga UNA sola vez (perezosamente) y se reutiliza en cada
petición, para no leer el disco en cada llamada.
"""

import sys
from pathlib import Path

import pandas as pd

# El paquete de IA (ai/) vive en la raíz del repo, dos arriba de backend/.
# backend/app/services/inference_service.py -> parents[3] = raíz del repo.
ROOT = Path(__file__).resolve().parents[3]#SUBE TRES NIVELES PARA LLEGAR A LA RAIZ DEL REPO, DONDE VIVE EL PAQUETE DE IA (ai/).
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))#ahora puedo importar desde ai/ sin problemas.

import numpy as np

from ai.src.config import (
    ARTIFACTS_DIR,
    EQ_BANDS_FRONTEND,
    EQ_GAIN_LIMIT_DB,
    FREQ_GRID,
    freq_columns,
)
from ai.src.features.audiometry import test_to_inverted_curve  # curva de compensacion invertida (248 pts) a partir del test.
from ai.src.features.eq_bridge import filters_to_eq_gains#traduce los filtros biquad crudos de la IA a las 9 ganancias que el frontend necesita para el ecualizador.
from ai.src.models.inverse_eq import InverseEQ#la ia que predice los filtros biquad a partir de la curva de frecuencias.

_MODEL = None
_MODEL_PATH = ARTIFACTS_DIR / "inverse_eq.joblib"


def _get_model() -> InverseEQ:
    global _MODEL
    if _MODEL is None:
        if not _MODEL_PATH.exists():
            raise FileNotFoundError(
                f"No existe el modelo entrenado en {_MODEL_PATH}. "
                f"Entrénalo con: python -m ai.src.train.train_inverse_eq"
            )
        _MODEL = InverseEQ.load(_MODEL_PATH)
    return _MODEL


def test_to_eq(results) -> dict:
    """results = lista [{'hz':..., 'score':...}, ...] (lo que guarda el test).

    Pipeline (3 pasos):
        1. INVERSION: la curva del test se invierte -> curva de compensacion que
           tiende a aplanar el dispositivo (fuerte -> recorta, debil -> realza).
        2. APLICACION: esa curva invertida se muestrea en las 9 bandas del EQ.
        3. IA ENCIMA: la curva invertida se le pasa a la IA 2; sus filtros se
           traducen a 9 ganancias y se SUMAN sobre la invertida. El total se
           recorta a +-EQ_GAIN_LIMIT_DB.

    Devuelve:
        bands    -> las 9 frecuencias del EQ del frontend
        gains    -> 9 ganancias finales en dB (invertida + IA), listas para `eqGains`
        inverted -> las 9 ganancias solo de la inversion (paso 1-2, para depurar)
        filters  -> los filtros biquad crudos que aporto la IA encima
    """
    band_freqs = [b["freq"] for b in EQ_BANDS_FRONTEND]
    lim = EQ_GAIN_LIMIT_DB

    # 1-2) Curva invertida (248 pts) y su muestreo en las 9 bandas (interp log-freq).
    inv_curve = test_to_inverted_curve(results)
    log_grid = np.log10(FREQ_GRID)
    inverted = np.clip(np.interp(np.log10(band_freqs), log_grid, inv_curve), -lim, lim)

    # 3) La IA 2 trabaja ENCIMA de la curva invertida (no sobre la original).
    model = _get_model()
    X = pd.DataFrame([inv_curve], columns=freq_columns())
    filters = model.predict_filters(X)[0]
    ia_delta = np.array(filters_to_eq_gains(filters), dtype=float)

    final = np.clip(inverted + ia_delta, -lim, lim)
    return {
        "bands": band_freqs,
        "gains": [round(float(g), 1) for g in final],
        "inverted": [round(float(g), 1) for g in inverted],
        "filters": filters,
    }
