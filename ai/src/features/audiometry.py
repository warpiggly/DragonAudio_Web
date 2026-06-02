"""
Puente entre la prueba de audicion y la IA.

Convierte las respuestas del test (AudioTest.js) en la curva de 248 puntos
que esperan las IAs. Es la version reenfocada de `umbrales_a_curva` del
notebook: alli la entrada era "umbral de volumen 0-100%"; aqui es la
CLARIDAD 0-10 que realmente devuelve el frontend (0 = no se oye, 10 = perfecto).

Idea: si en una frecuencia el usuario oye poco (claridad baja), esa banda
necesita mas correccion. Lo expresamos como una caida en dB en esa zona de la
curva (claridad 0 -> -12 dB, claridad 10 -> 0 dB). Esa curva se le pasa luego
a la IA 2 para que genere los filtros.

Esto NO esta conectado al frontend todavia; es solo la funcion lista para
recibir, en el futuro, el JSON que produce AudioTest.js.
"""

from __future__ import annotations

import numpy as np

from ..config import CLARITY_MAX, CLARITY_MIN, FREQ_GRID, freq_columns

# Correccion maxima (en dB) que se asigna a la peor claridad posible.
DEFAULT_MAX_CORRECTION_DB = 12.0


def _normalize_responses(responses) -> dict[float, float]:
    """Acepta los formatos posibles y devuelve {frecuencia_hz: claridad}.

    - Lista estilo AudioTest.js: [{"hz": 1000, "score": 8}, ...]
      (tambien acepta la clave "frequency" por compatibilidad).
    - Diccionario simple: {1000: 8, 2000: 6, ...}
    """
    if isinstance(responses, dict):
        return {float(k): float(v) for k, v in responses.items()}
    out = {}
    for r in responses:
        hz = r["hz"] if "hz" in r else r["frequency"]
        out[float(hz)] = float(r["score"])
    return out


def clarity_to_curve(
    responses,
    max_correction_db: float = DEFAULT_MAX_CORRECTION_DB,
) -> np.ndarray:
    """Convierte respuestas de claridad 0-10 en una curva de 248 puntos (dB).

    Para cada una de las 248 frecuencias de la malla, busca la frecuencia de
    la prueba mas cercana y mapea su claridad a una correccion en dB:

        claridad 10 (perfecto) ->   0 dB  (no necesita correccion)
        claridad 0  (no se oye) -> -max_correction_db

    Devuelve un np.ndarray de longitud 248, en el mismo orden que
    config.freq_columns(), listo para pasar a las IAs.
    """
    medidas = _normalize_responses(responses)
    if not medidas:
        raise ValueError("No se recibieron respuestas de la prueba.")

    freqs_prueba = list(medidas.keys())
    span = CLARITY_MAX - CLARITY_MIN  # = 10

    curva = np.zeros(len(FREQ_GRID))
    for i, hz in enumerate(FREQ_GRID):
        cercana = min(freqs_prueba, key=lambda f, h=hz: abs(f - h))
        claridad = medidas[cercana]
        # 10 -> 0 ; 0 -> 1 (fraccion de correccion necesaria)
        deficit = (CLARITY_MAX - claridad) / span
        curva[i] = -deficit * max_correction_db
    return curva


def curve_as_dict(curva: np.ndarray) -> dict[str, float]:
    """Empareja la curva con los nombres de columna (util para depurar/serializar)."""
    return {c: float(v) for c, v in zip(freq_columns(), curva)}
