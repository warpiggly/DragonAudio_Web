"""
Carga y preparacion de los datos para entrenar las dos IAs.

El notebook hacia esto a mano dentro de las celdas (pd.read_csv + pd.merge).
Aqui esta encapsulado en funciones reutilizables, con un detalle clave que
pide el plan: el split se hace POR DISPOSITIVO, no por variante, para que el
mismo dispositivo no aparezca a la vez en train y en test (evita "leakage").

Entradas: los CSV de ai/data/processed/ (generados por build_dataset.py).
Salidas: DataFrames/arrays listos para sklearn. No toca disco de modelos.
"""

from __future__ import annotations

import pandas as pd

from ..config import (
    DEVICES_WIDE_CSV,
    FREQ_RESPONSE_CSV,
    N_FILTERS,
    RANDOM_STATE,
    freq_columns,
)

# Claves que identifican una fila (dispositivo + variante de EQ) en ambos CSV.
_KEYS = ["device_name", "device_type", "eq_variant"]


def _load_csv(path):
    if not path.exists():
        raise FileNotFoundError(
            f"No existe {path}. Genera primero los datos con:\n"
            f"    python -m ai.src.data.build_dataset"
        )
    return pd.read_csv(path)


def build_score_table():
    """Datos para la IA 1 (predictor de mejora de score).

    X = curva de 248 puntos del EQ (de frequency_response.csv)
    y = score_delta = cuanto mejora el dispositivo con ese EQ (de devices_wide.csv)
    groups = device_name (para el split por dispositivo)

    Solo hay score en altavoces, asi que las filas sin score_delta se descartan.
    """
    df_fr = _load_csv(FREQ_RESPONSE_CSV)
    df_wide = _load_csv(DEVICES_WIDE_CSV)

    fcols = freq_columns()
    df = pd.merge(df_fr[_KEYS + fcols], df_wide[_KEYS + ["score_delta"]], on=_KEYS, how="inner")
    df = df.dropna(subset=["score_delta"])

    X = df[fcols].fillna(0.0)
    y = df["score_delta"]
    groups = df["device_name"]
    return X, y, groups


def filter_columns(n_filters: int = N_FILTERS) -> list[str]:
    """Nombres de las columnas de filtros (3 por filtro: fc, gain, q)."""
    cols = []
    for i in range(1, n_filters + 1):
        cols += [f"f{i}_fc_hz", f"f{i}_gain_db", f"f{i}_q"]
    return cols


def build_inverse_table(n_filters: int = N_FILTERS):
    """Datos para la IA 2 (genera los filtros EQ a partir de la curva).

    X = curva de 248 puntos (de frequency_response.csv)
    y = n_filters * 3 valores (fc_hz, gain_db, q de cada filtro, de devices_wide.csv)
    groups = device_name (para el split por dispositivo)
    """
    df_fr = _load_csv(FREQ_RESPONSE_CSV)
    df_wide = _load_csv(DEVICES_WIDE_CSV)

    fcols = freq_columns()
    ycols = filter_columns(n_filters)
    df = pd.merge(df_fr[_KEYS + fcols], df_wide[_KEYS + ycols], on=_KEYS, how="inner")
    df = df.dropna(subset=ycols)

    X = df[fcols].fillna(0.0)
    y = df[ycols]
    groups = df["device_name"]
    return X, y, groups


def split_by_device(X, y, groups, test_size: float = 0.2, random_state: int = RANDOM_STATE):
    """Divide en train/test garantizando que cada dispositivo cae entero en uno.

    Reemplaza al train_test_split aleatorio del notebook. Usa GroupShuffleSplit
    agrupando por device_name (el array `groups`).
    """
    from sklearn.model_selection import GroupShuffleSplit

    splitter = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=random_state)
    train_idx, test_idx = next(splitter.split(X, y, groups))
    return (
        X.iloc[train_idx], X.iloc[test_idx],
        y.iloc[train_idx], y.iloc[test_idx],
    )
