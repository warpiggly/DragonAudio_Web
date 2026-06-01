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


# --- bandas ISO (del plan de trabajo) ---
# Frecuencias de la prueba de audicion (AudioTest.js). El plan pide ampliarla
# a estas 10 bandas de octava ISO; hoy el frontend usa 6 (250..8000).
TEST_FREQUENCIES_ISO = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

# Bandas del ecualizador grafico final (31 bandas, 1/3 de octava ISO).
EQ_BANDS_ISO = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315,
    400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000,
    5000, 6300, 8000, 10000, 12500, 16000, 20000,
]

# Cuantos filtros biquad predice la IA 2 (el notebook usaba 7).
# Se puede subir hasta 31 porque devices_wide.csv trae columnas f1..f31.
N_FILTERS = 7

# Semilla fija para que los entrenamientos sean reproducibles.
RANDOM_STATE = 42
