"""
Configuracion compartida del modulo de IA.

Aqui viven las rutas y las constantes que usan todos los demas archivos
(features, models, train). Tener esto en un solo sitio evita repetir rutas
"a mano" y hace facil cambiar algo una sola vez.

Nada aqui se conecta todavia con el backend ni con el frontend: son solo
valores y rutas locales.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

# --- rutas ---
# Este archivo vive en: ai/src/config.py  ->  la raiz "ai/" esta un nivel arriba.
AI_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = AI_ROOT / "data" / "processed"   # CSVs generados por build_dataset.py
ARTIFACTS_DIR = AI_ROOT / "artifacts"            # aqui se guardan los modelos .joblib

# Archivos de datos que produce ai/src/data/build_dataset.py
FREQ_RESPONSE_CSV = PROCESSED_DIR / "frequency_response.csv"
DEVICES_WIDE_CSV = PROCESSED_DIR / "devices_wide.csv"

# --- malla de frecuencias ---
# DEBE coincidir con build_dataset.py: 248 puntos log entre 20 Hz y 20 kHz.
FREQ_GRID = np.geomspace(20.0, 20000.0, 248)


def freq_columns() -> list[str]:
    """Nombres de las 248 columnas de respuesta en frecuencia.

    Reproduce exactamente el formato que escribe build_dataset.py
    (ej: 'f_20.0Hz', 'f_1000Hz'), para poder seleccionarlas del CSV.
    """
    return [f"f_{int(round(f))}Hz" if f >= 100 else f"f_{f:.1f}Hz" for f in FREQ_GRID]


# --- prueba de audicion ---
# Escala con la que el usuario califica cada tono en AudioTest.js.
# OJO: el frontend usa 0-10 (0 = no se oye, 10 = perfecto). Antes era 1-5.
CLARITY_MIN = 0
CLARITY_MAX = 10

# Las 11 frecuencias que realmente reproduce AudioTest.js (constante BANDS).
# No son las 10 ISO de octava del plan; reflejan lo que mide el frontend hoy.
TEST_FREQUENCIES = [40, 80, 125, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000]

# --- ecualizador del frontend (MusicPlayer.js, constante EQ_BANDS) ---
# 9 bandas FIJAS con su tipo de filtro. A esto se traduce la salida de la IA 2
# (ver features/eq_bridge.py): los filtros biquad libres -> ganancia por banda.
EQ_BANDS_FRONTEND = [
    {"freq": 31,   "type": "lowshelf"},
    {"freq": 63,   "type": "peaking"},
    {"freq": 125,  "type": "peaking"},
    {"freq": 250,  "type": "peaking"},
    {"freq": 500,  "type": "peaking"},
    {"freq": 1000, "type": "peaking"},
    {"freq": 2000, "type": "peaking"},
    {"freq": 4000, "type": "peaking"},
    {"freq": 8000, "type": "highshelf"},
]
# Rango de cada slider del EQ en el frontend (dB). Se usa para recortar (clamp).
EQ_GAIN_LIMIT_DB = 12.0

# Bandas del EQ grafico de 31 (1/3 octava) que pide el plan como meta final.
# Aun no implementadas en el frontend; se dejan como referencia.
EQ_BANDS_ISO_31 = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315,
    400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000,
    5000, 6300, 8000, 10000, 12500, 16000, 20000,
]

# Frecuencia de muestreo del AudioContext del frontend (y del dataset).
DEFAULT_FS = 48000.0

# Cuantos filtros biquad predice la IA 2 (el notebook usaba 7).
# Se puede subir hasta 31 porque devices_wide.csv trae columnas f1..f31.
N_FILTERS = 7

# Semilla fija para que los entrenamientos sean reproducibles.
RANDOM_STATE = 42
