"""
Puente IA 2 -> ecualizador del frontend.

La IA 2 (inverse_eq.py) genera filtros biquad LIBRES: cada uno con su propia
frecuencia, ganancia y Q (ej: PK a 3270 Hz, +4.2 dB, Q=1.8). Pero el EQ del
frontend (MusicPlayer.js) tiene 9 bandas FIJAS, donde cada banda es solo una
ganancia en dB. No coinciden, asi que hay que traducir.

Como se traduce: se calcula la respuesta en frecuencia combinada de todos los
filtros de la IA y se "muestrea" en las 9 frecuencias del EQ. La ganancia que
tendria la curva en 31 Hz se convierte en la ganancia de la banda de 31 Hz,
y asi con las 9. El resultado se recorta a +-12 dB (el rango de los sliders).

Salida: lista de 9 numeros (dB), en el mismo orden que config.EQ_BANDS_FRONTEND,
lista para asignarse al estado `eqGains` del frontend.

Esto NO esta conectado todavia; es la funcion lista para el dia que se conecte.
"""

from __future__ import annotations

import numpy as np

from ..config import DEFAULT_FS, EQ_BANDS_FRONTEND, EQ_GAIN_LIMIT_DB


def _biquad_mag_db(filter_type: str, fc: float, gain_db: float, q: float,
                   freqs: np.ndarray, fs: float = DEFAULT_FS) -> np.ndarray:
    """Respuesta en magnitud (dB) de un biquad RBJ para cada frecuencia.

    Soporta PK (peaking), LS/lowshelf y HS/highshelf, que es lo que producen
    la IA 2 y el frontend. Tipos desconocidos -> respuesta plana (0 dB).
    Misma formulacion que build_dataset.py, para que todo el proyecto sea
    coherente.
    """
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * fc / fs
    cos_w0 = np.cos(w0)
    sin_w0 = np.sin(w0)
    alpha = sin_w0 / (2 * q)
    t = filter_type.upper()

    if t in ("PK", "PEAKING"):
        b0 = 1 + alpha * A;   b1 = -2 * cos_w0;  b2 = 1 - alpha * A
        a0 = 1 + alpha / A;   a1 = -2 * cos_w0;  a2 = 1 - alpha / A
    elif t in ("LS", "LOWSHELF"):
        sq = 2 * np.sqrt(A) * alpha
        b0 =      A * ((A + 1) - (A - 1) * cos_w0 + sq)
        b1 =  2 * A * ((A - 1) - (A + 1) * cos_w0)
        b2 =      A * ((A + 1) - (A - 1) * cos_w0 - sq)
        a0 =          (A + 1) + (A - 1) * cos_w0 + sq
        a1 = -2 *    ((A - 1) + (A + 1) * cos_w0)
        a2 =          (A + 1) + (A - 1) * cos_w0 - sq
    elif t in ("HS", "HIGHSHELF"):
        sq = 2 * np.sqrt(A) * alpha
        b0 =      A * ((A + 1) + (A - 1) * cos_w0 + sq)
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
        b2 =      A * ((A + 1) + (A - 1) * cos_w0 - sq)
        a0 =          (A + 1) - (A - 1) * cos_w0 + sq
        a1 =  2 *    ((A - 1) - (A + 1) * cos_w0)
        a2 =          (A + 1) - (A - 1) * cos_w0 - sq
    else:
        return np.zeros_like(freqs)

    b = np.array([b0, b1, b2]) / a0
    a = np.array([1.0, a1 / a0, a2 / a0])
    w = 2 * np.pi * freqs / fs
    ejw = np.exp(-1j * w)
    ej2w = np.exp(-2j * w)
    H = (b[0] + b[1] * ejw + b[2] * ej2w) / (1.0 + a[1] * ejw + a[2] * ej2w)
    mag = np.maximum(np.abs(H), 1e-12)
    return 20 * np.log10(mag)


def filters_to_eq_gains(filters, fs: float = DEFAULT_FS) -> list[float]:
    """Traduce los filtros de la IA 2 a las 9 ganancias del EQ del frontend.

    `filters`: lista de dicts {type, fc_hz, gain_db, q} (lo que devuelve
    InverseEQ.predict_filters()).

    Devuelve: lista de 9 floats (dB) recortados a +-EQ_GAIN_LIMIT_DB, en el
    orden de config.EQ_BANDS_FRONTEND. Listos para el estado `eqGains`.
    """
    band_freqs = np.array([b["freq"] for b in EQ_BANDS_FRONTEND], dtype=float)

    total = np.zeros_like(band_freqs)
    for f in filters:
        total += _biquad_mag_db(f["type"], f["fc_hz"], f["gain_db"], f["q"], band_freqs, fs)

    total = np.clip(total, -EQ_GAIN_LIMIT_DB, EQ_GAIN_LIMIT_DB)
    return [round(float(g), 1) for g in total]
