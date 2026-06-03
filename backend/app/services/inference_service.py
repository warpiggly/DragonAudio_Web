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

from ai.src.config import ARTIFACTS_DIR, EQ_BANDS_FRONTEND, freq_columns
from ai.src.features.audiometry import clarity_to_curve#traduce la claridad del test (0-10) a una curva de 248 puntos, que es lo que el modelo espera como entrada.
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

    Devuelve:
        bands   -> las 9 frecuencias del EQ del frontend
        gains   -> 9 ganancias en dB (mismo orden), listas para `eqGains`
        filters -> los filtros biquad crudos de la IA (por si se quieren mostrar)
    """
    curve = clarity_to_curve(results)#1.prueba a convertir la claridad del test (0-10) a una curva de 248 puntos, que es lo que el modelo espera como entrada.
    model = _get_model()#2.carga el modelo de IA (si no está cargado ya) desde el disco. El modelo es un InverseEQ, que predice los filtros biquad a partir de la curva de frecuencias.
    # DataFrame con los nombres de columna con que se entrenó (evita el warning
    # de sklearn sobre "feature names").
    X = pd.DataFrame([curve], columns=freq_columns())
    filters = model.predict_filters(X)[0]#3.IA predice los filtros biquad a partir de la curva de frecuencias. La salida es una lista de dicts, con formato legible para el frontend.
    gains = filters_to_eq_gains(filters)#4.traduce los filtros biquad crudos de la IA a las 9 ganancias que el frontend necesita para el ecualizador. La salida es una lista de 9 ganancias en dB, en el mismo orden que las frecuencias del EQ del frontend.
    bands = [b["freq"] for b in EQ_BANDS_FRONTEND]
    return {"bands": bands, "gains": gains, "filters": filters}
