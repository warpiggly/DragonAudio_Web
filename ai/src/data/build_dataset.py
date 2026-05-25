"""
Consolida los datos de EQ (altavoces) y headphone_eq (auriculares) de Spinorama
en un dataset unico apto para ML.

Salidas (carpeta dataset_compiled/):
  - filters_long.csv           Una fila por filtro biquad (formato tidy).
  - devices_wide.csv           Una fila por (dispositivo, variante de EQ) con
                               metadatos + filtros desplegados en columnas.
  - frequency_response.csv     Una fila por (dispositivo, variante) y la
                               respuesta en frecuencia del EQ evaluada en una
                               malla log de 248 puntos (20 Hz - 20 kHz).
                               *** Este es el feature vector listo para ML. ***
  - dataset.json               Toda la informacion anidada (un objeto por
                               dispositivo, con su lista de variantes).
  - dataset.xlsx               Excel con multiples hojas (filters, devices,
                               freq_response, freq_grid, README).
  - README.md                  Diccionario de datos y guia rapida de uso.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd


# ---------- configuracion ----------
# Este script vive en: ai/src/data/build_dataset.py
# La raiz del modulo ai/ esta dos niveles arriba.
AI_ROOT = Path(__file__).resolve().parents[2]
ROOT = AI_ROOT / "data" / "raw" / "spinorama-develop" / "datas"
EQ_DIR = ROOT / "eq"
HP_DIR = ROOT / "headphone_eq"
OUT = AI_ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

# Malla de frecuencias para la respuesta del EQ (1/24 de octava).
FREQ_GRID = np.geomspace(20.0, 20000.0, 248)
DEFAULT_FS = 48000.0  # frecuencia de muestreo asumida para los biquads

# ---------- parsing de los archivos de filtros ----------

# Maneja los dos formatos cabecera (Spinorama clasico y AutoEQ con #).
FILTER_RE = re.compile(
    r"Filter\s*\d+\s*:\s*ON\s+(?P<type>[A-Z]+Q?)\s+Fc\s+(?P<fc>[\d.]+)\s*Hz"
    r"(?:\s+Gain\s+(?P<gain>[+\-]?[\d.]+)\s*dB)?\s+Q\s+(?P<q>[\d.]+)",
    re.IGNORECASE,
)
PREAMP_RE   = re.compile(r"Preamp:\s*([+\-]?[\d.]+)\s*dB", re.IGNORECASE)
SCORE_RE    = re.compile(r"Preference Score\s*([\d.]+)\s*with EQ\s*([\d.]+)", re.IGNORECASE)
SOURCE_RE   = re.compile(r"computed from\s+(.*?)\s+data", re.IGNORECASE)
DATED_RE    = re.compile(r"Dated:\s*([\d\-: ]+)")
GEN_RE      = re.compile(r"Generated.*v([\d.]+)", re.IGNORECASE)
LOSSTYPE_RE = re.compile(r"#\s*Loss Type:\s*(\S+)", re.IGNORECASE)


@dataclass
class ParsedEQ:
    device_name: str
    device_type: str            # 'speaker' o 'headphone'
    eq_variant: str             # autoeq, dbx-1215, dbx-1231, flat, score, etc.
    source_file: str
    preamp_db: float | None
    score_before_eq: float | None
    score_with_eq: float | None
    data_source: str | None     # ASR, ErinsAudioCorner, Vendors-X, etc.
    loss_type: str | None       # HeadphoneScore / HeadphoneFlat (auriculares)
    generator_version: str | None
    generated_at: str | None
    num_filters: int
    filters: list[dict]         # [{idx, type, fc_hz, gain_db, q}, ...]


def _parse_eq_file(path: Path, device_name: str, device_type: str, variant: str) -> ParsedEQ | None:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None

    preamp = float(m.group(1)) if (m := PREAMP_RE.search(text)) else None
    score_before, score_after = (None, None)
    if (m := SCORE_RE.search(text)):
        score_before, score_after = float(m.group(1)), float(m.group(2))
    source = m.group(1).strip() if (m := SOURCE_RE.search(text)) else None
    dated = m.group(1).strip() if (m := DATED_RE.search(text)) else None
    gen   = m.group(1).strip() if (m := GEN_RE.search(text)) else None
    loss  = m.group(1).strip() if (m := LOSSTYPE_RE.search(text)) else None

    filters = []
    for idx, m in enumerate(FILTER_RE.finditer(text), start=1):
        gain = m.group("gain")
        filters.append({
            "filter_index": idx,
            "filter_type": m.group("type").upper(),
            "fc_hz": float(m.group("fc")),
            "gain_db": float(gain) if gain is not None else 0.0,
            "q": float(m.group("q")),
        })

    if not filters:
        return None

    return ParsedEQ(
        device_name=device_name,
        device_type=device_type,
        eq_variant=variant,
        source_file=str(path.relative_to(ROOT)).replace("\\", "/"),
        preamp_db=preamp,
        score_before_eq=score_before,
        score_with_eq=score_after,
        data_source=source,
        loss_type=loss,
        generator_version=gen,
        generated_at=dated,
        num_filters=len(filters),
        filters=filters,
    )


def _variant_from_name(filename: str) -> str:
    """Deriva una etiqueta limpia de variante desde el nombre del archivo."""
    stem = filename.replace(".txt", "")
    if stem in ("iir", "iir-autoeq"):
        return "autoeq"
    if stem.startswith("iir-autoeq-"):
        return stem.replace("iir-autoeq-", "")
    if stem.startswith("iir-"):
        return stem.replace("iir-", "")
    return stem


# ---------- IIR helpers: respuesta en frecuencia ----------

def _biquad_response(filter_type: str, fc: float, gain_db: float, q: float,
                     freqs: np.ndarray, fs: float = DEFAULT_FS) -> np.ndarray:
    """
    Devuelve la respuesta en magnitud (dB) de un biquad RBJ para cada freq.
    Soporta PK, LS, HS, HPQ (high-pass con Q), LP, NO, BP (aprox).
    Tipos desconocidos -> respuesta plana (0 dB).
    """
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * fc / fs
    cos_w0 = np.cos(w0)
    sin_w0 = np.sin(w0)
    alpha = sin_w0 / (2 * q)
    t = filter_type.upper()

    if t == "PK":
        b0 = 1 + alpha * A;   b1 = -2 * cos_w0;  b2 = 1 - alpha * A
        a0 = 1 + alpha / A;   a1 = -2 * cos_w0;  a2 = 1 - alpha / A
    elif t == "LS":
        sq = 2 * np.sqrt(A) * alpha
        b0 =      A * ((A + 1) - (A - 1) * cos_w0 + sq)
        b1 =  2 * A * ((A - 1) - (A + 1) * cos_w0)
        b2 =      A * ((A + 1) - (A - 1) * cos_w0 - sq)
        a0 =          (A + 1) + (A - 1) * cos_w0 + sq
        a1 = -2 *    ((A - 1) + (A + 1) * cos_w0)
        a2 =          (A + 1) + (A - 1) * cos_w0 - sq
    elif t == "HS":
        sq = 2 * np.sqrt(A) * alpha
        b0 =      A * ((A + 1) + (A - 1) * cos_w0 + sq)
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w0)
        b2 =      A * ((A + 1) + (A - 1) * cos_w0 - sq)
        a0 =          (A + 1) - (A - 1) * cos_w0 + sq
        a1 =  2 *    ((A - 1) - (A + 1) * cos_w0)
        a2 =          (A + 1) - (A - 1) * cos_w0 - sq
    elif t in ("HPQ", "HP"):
        b0 =  (1 + cos_w0) / 2;  b1 = -(1 + cos_w0);  b2 = (1 + cos_w0) / 2
        a0 = 1 + alpha;          a1 = -2 * cos_w0;    a2 = 1 - alpha
    elif t == "LP":
        b0 =  (1 - cos_w0) / 2;  b1 = 1 - cos_w0;     b2 = (1 - cos_w0) / 2
        a0 = 1 + alpha;          a1 = -2 * cos_w0;    a2 = 1 - alpha
    elif t == "NO":
        b0 = 1;                  b1 = -2 * cos_w0;    b2 = 1
        a0 = 1 + alpha;          a1 = -2 * cos_w0;    a2 = 1 - alpha
    elif t == "BP":
        b0 = alpha;              b1 = 0;              b2 = -alpha
        a0 = 1 + alpha;          a1 = -2 * cos_w0;    a2 = 1 - alpha
    else:
        return np.zeros_like(freqs)

    b = np.array([b0, b1, b2]) / a0
    a = np.array([1.0, a1 / a0, a2 / a0])
    w = 2 * np.pi * freqs / fs
    ejw  = np.exp(-1j * w)
    ej2w = np.exp(-2j * w)
    num = b[0] + b[1] * ejw + b[2] * ej2w
    den = 1.0 + a[1] * ejw + a[2] * ej2w
    H = num / den
    mag = np.abs(H)
    mag = np.where(mag < 1e-12, 1e-12, mag)
    return 20 * np.log10(mag)


def eq_response(parsed: ParsedEQ, freqs: np.ndarray = FREQ_GRID) -> np.ndarray:
    total = np.zeros_like(freqs)
    for f in parsed.filters:
        total += _biquad_response(f["filter_type"], f["fc_hz"], f["gain_db"], f["q"], freqs)
    if parsed.preamp_db is not None:
        total += parsed.preamp_db
    return total


# ---------- recorrido de los directorios ----------

def parse_all() -> list[ParsedEQ]:
    items: list[ParsedEQ] = []

    # Altavoces
    for device_dir in sorted(EQ_DIR.iterdir()):
        if not device_dir.is_dir():
            continue
        for txt in device_dir.glob("iir*.txt"):
            variant = _variant_from_name(txt.name)
            parsed = _parse_eq_file(txt, device_dir.name, "speaker", variant)
            if parsed is not None:
                items.append(parsed)

    # Auriculares
    for device_dir in sorted(HP_DIR.iterdir()):
        if not device_dir.is_dir():
            continue
        for txt in device_dir.glob("iir-autoeq-*.txt"):
            variant = _variant_from_name(txt.name)  # 'flat' o 'score'
            parsed = _parse_eq_file(txt, device_dir.name, "headphone", variant)
            if parsed is not None:
                items.append(parsed)

    return items


# ---------- ensamblaje de tablas ----------

MAX_FILTERS_WIDE = 31  # se cubren los EQ de 31 bandas (dbx-1231)


def build_filters_long(items: list[ParsedEQ]) -> pd.DataFrame:
    rows = []
    for it in items:
        for f in it.filters:
            rows.append({
                "device_name": it.device_name,
                "device_type": it.device_type,
                "eq_variant": it.eq_variant,
                "data_source": it.data_source,
                "score_before_eq": it.score_before_eq,
                "score_with_eq": it.score_with_eq,
                "preamp_db": it.preamp_db,
                "num_filters": it.num_filters,
                "filter_index": f["filter_index"],
                "filter_type": f["filter_type"],
                "fc_hz": f["fc_hz"],
                "gain_db": f["gain_db"],
                "q": f["q"],
                "generator_version": it.generator_version,
                "generated_at": it.generated_at,
                "source_file": it.source_file,
            })
    return pd.DataFrame(rows)


def build_devices_wide(items: list[ParsedEQ]) -> pd.DataFrame:
    rows = []
    for it in items:
        row = {
            "device_name": it.device_name,
            "device_type": it.device_type,
            "eq_variant": it.eq_variant,
            "data_source": it.data_source,
            "loss_type": it.loss_type,
            "score_before_eq": it.score_before_eq,
            "score_with_eq": it.score_with_eq,
            "score_delta": (
                it.score_with_eq - it.score_before_eq
                if it.score_before_eq is not None and it.score_with_eq is not None
                else None
            ),
            "preamp_db": it.preamp_db,
            "num_filters": it.num_filters,
            "generator_version": it.generator_version,
            "generated_at": it.generated_at,
            "source_file": it.source_file,
        }
        for i in range(MAX_FILTERS_WIDE):
            f = it.filters[i] if i < len(it.filters) else None
            row[f"f{i+1}_type"]    = f["filter_type"] if f else None
            row[f"f{i+1}_fc_hz"]   = f["fc_hz"]       if f else None
            row[f"f{i+1}_gain_db"] = f["gain_db"]     if f else None
            row[f"f{i+1}_q"]       = f["q"]           if f else None
        rows.append(row)
    return pd.DataFrame(rows)


def build_freq_response(items: list[ParsedEQ]) -> pd.DataFrame:
    cols = [f"f_{int(round(f))}Hz" if f >= 100 else f"f_{f:.1f}Hz" for f in FREQ_GRID]
    rows = []
    for it in items:
        resp = eq_response(it)
        row = {
            "device_name": it.device_name,
            "device_type": it.device_type,
            "eq_variant": it.eq_variant,
            "data_source": it.data_source,
            "score_with_eq": it.score_with_eq,
        }
        row.update({c: float(v) for c, v in zip(cols, resp)})
        rows.append(row)
    return pd.DataFrame(rows)


def build_nested_json(items: list[ParsedEQ]) -> list[dict]:
    by_device: dict[tuple[str, str], dict] = {}
    for it in items:
        key = (it.device_type, it.device_name)
        d = by_device.setdefault(key, {
            "device_name": it.device_name,
            "device_type": it.device_type,
            "variants": [],
        })
        d["variants"].append({
            "eq_variant": it.eq_variant,
            "data_source": it.data_source,
            "loss_type": it.loss_type,
            "score_before_eq": it.score_before_eq,
            "score_with_eq": it.score_with_eq,
            "preamp_db": it.preamp_db,
            "num_filters": it.num_filters,
            "generator_version": it.generator_version,
            "generated_at": it.generated_at,
            "source_file": it.source_file,
            "filters": it.filters,
        })
    return [by_device[k] for k in sorted(by_device.keys())]


# ---------- escritura ----------

def write_readme(stats: dict) -> None:
    txt = f"""# Spinorama EQ Dataset (consolidado)

Generado: {datetime.utcnow().isoformat(timespec='seconds')}Z
Origen: `spinorama-develop/datas/eq/` (altavoces) y `spinorama-develop/datas/headphone_eq/` (auriculares).

## Resumen
- Dispositivos totales: **{stats['devices']}**  (altavoces: {stats['speakers']}, auriculares: {stats['headphones']})
- Variantes de EQ (filas en `devices_wide.csv`): **{stats['variants']}**
- Filtros biquad totales (filas en `filters_long.csv`): **{stats['filters']}**

## Archivos

| Archivo | Filas | Para que sirve |
|---|---|---|
| `filters_long.csv` | {stats['filters']} | Formato tidy: 1 fila = 1 filtro. Ideal para EDA, agregados y para entrenar modelos a nivel de filtro (p. ej. predecir tipo/Fc/Q a partir de la respuesta). |
| `devices_wide.csv` | {stats['variants']} | 1 fila = (dispositivo, variante de EQ) con los filtros desplegados en columnas (`f1_fc_hz`, `f1_gain_db`, ... hasta f31). Practico para regresiones clasicas tabulares. |
| `frequency_response.csv` | {stats['variants']} | **Lo mas importante para ML**: 1 fila = (dispositivo, variante) y la respuesta del EQ evaluada en 248 puntos log entre 20 Hz y 20 kHz (en dB). Vector de features de longitud fija. |
| `dataset.json` | {stats['devices']} | Mismo contenido en JSON anidado (un objeto por dispositivo con su lista de variantes y filtros). |
| `dataset.xlsx` | - | Excel con hojas `filters`, `devices`, `freq_response`, `freq_grid`, `README`. |

## Diccionario de columnas

### Comunes
- `device_name`: nombre del altavoz o auricular.
- `device_type`: `speaker` | `headphone`.
- `eq_variant`: variante del EQ. Para altavoces: `autoeq`, `dbx-1215`, `dbx-1231`, `flat`, `lw`, `pir`, `maiky76`, `flipflop`, `jbl`, etc. Para auriculares: `flat` o `score`.
- `data_source`: de donde vienen las mediciones del altavoz (ASR, ErinsAudioCorner, Princeton, Vendors-XXX, Misc). Vacio para auriculares.
- `loss_type`: solo auriculares (`HeadphoneScore` / `HeadphoneFlat`).
- `score_before_eq` / `score_with_eq`: preference score Olive antes/despues del EQ. Solo aparece en altavoces.
- `preamp_db`: ganancia global negativa necesaria para no clipear con los filtros aplicados.
- `num_filters`: cuantos filtros activos tiene la variante.
- `generator_version`, `generated_at`: traza de origen.
- `source_file`: ruta relativa al archivo original dentro de `datas/`.

### filters_long.csv (adicionales por fila-filtro)
- `filter_index`: 1..N.
- `filter_type`: `PK` (peaking, ~99%), `LS`/`HS` (low/high shelf), `HPQ`/`HP` (high-pass), `LP` (low-pass), `NO` (notch), `BP` (band-pass).
- `fc_hz`: frecuencia central / corte.
- `gain_db`: ganancia (0 para HP/LP/NO/BP).
- `q`: factor de calidad.

### devices_wide.csv
- `score_delta` = `score_with_eq - score_before_eq` (cuanto mejora el EQ).
- `f1..f31`: columnas con `_type`, `_fc_hz`, `_gain_db`, `_q`. NaN si el EQ tiene menos filtros.

### frequency_response.csv
- `f_<freq>Hz`: magnitud en dB del EQ aplicado, a esa frecuencia.
- Calculo: suma en dB de la respuesta de cada biquad RBJ (fs=48 kHz) mas el preamp.

## Que es lo mas importante para entrenar modelos

1. **`frequency_response.csv` es el feature/target principal.** Da un vector de longitud fija (248) por EQ. Sirve para:
   - **Regresion**: dado un vector objetivo, predecir los parametros de filtros que lo aproximan (problema inverso: el "auto EQ" en si).
   - **Clustering / dim. reduction**: agrupar dispositivos con respuestas parecidas (PCA, UMAP).
   - **Clasificacion**: speaker vs headphone, marca, vendor, etc.

2. **`devices_wide.csv` + `filters_long.csv`** son la verdad-base (lo que el modelo debe aprender a producir): los parametros de los biquads `(type, fc, gain, q)`. Entrena un decoder que tome la respuesta y devuelva la lista de filtros (clasico problema de "PEQ fitting").

3. **`score_before_eq` / `score_with_eq` / `score_delta`** son etiquetas de calidad utiles para:
   - Regresion supervisada sobre la calidad del EQ.
   - Filtrar el dataset: por ejemplo, solo entrenar con EQs que mejoran score (`score_delta > 0`).

4. **`data_source`** ayuda a controlar sesgo (no mezcles ASR y vendor measurements sin pensarlo) y a hacer splits estratificados.

### Recetas rapidas

- **Baseline**: regresion lineal multivariada de `frequency_response.csv` -> `score_with_eq`.
- **Auto-EQ inverso**: encoder MLP que toma 248 puntos y predice una secuencia de hasta 7 filtros (un transformer pequenio funciona; padding con tipo `PK`, `gain_db=0`).
- **Embedding de dispositivos**: autoencoder sobre la respuesta -> compara dispositivos en el espacio latente.

### Splits sugeridos
- Split **por dispositivo** (no por variante) para evitar leakage. Cada `device_name` queda 100% en train o en test.
- Estratifica por `device_type` y por `data_source` cuando aplique.
"""
    (OUT / "README.md").write_text(txt, encoding="utf-8")


def main() -> None:
    print("Parseando archivos...")
    items = parse_all()

    speakers   = sum(1 for x in items if x.device_type == "speaker")
    headphones = sum(1 for x in items if x.device_type == "headphone")
    devices    = len({(x.device_type, x.device_name) for x in items})
    filters    = sum(x.num_filters for x in items)
    stats = {
        "devices": devices,
        "speakers": len({x.device_name for x in items if x.device_type == "speaker"}),
        "headphones": len({x.device_name for x in items if x.device_type == "headphone"}),
        "variants": len(items),
        "filters": filters,
    }
    print(f"  -> {stats}")

    print("Construyendo tablas...")
    df_long = build_filters_long(items)
    df_wide = build_devices_wide(items)
    df_fr   = build_freq_response(items)

    print("Escribiendo CSVs...")
    df_long.to_csv(OUT / "filters_long.csv",       index=False, encoding="utf-8")
    df_wide.to_csv(OUT / "devices_wide.csv",       index=False, encoding="utf-8")
    df_fr.to_csv(  OUT / "frequency_response.csv", index=False, encoding="utf-8")

    # Complementos: mismas tablas pero separadas por tipo de dispositivo.
    # NO sustituyen a los archivos completos, son adicionales.
    print("Escribiendo CSVs separados por device_type...")
    for dtype in ("speaker", "headphone"):
        suffix = "speakers" if dtype == "speaker" else "headphones"
        df_long[df_long.device_type == dtype].to_csv(
            OUT / f"filters_long_{suffix}.csv",       index=False, encoding="utf-8")
        df_wide[df_wide.device_type == dtype].to_csv(
            OUT / f"devices_wide_{suffix}.csv",       index=False, encoding="utf-8")
        df_fr[df_fr.device_type == dtype].to_csv(
            OUT / f"frequency_response_{suffix}.csv", index=False, encoding="utf-8")

    print("Escribiendo JSON...")
    with (OUT / "dataset.json").open("w", encoding="utf-8") as fh:
        json.dump(build_nested_json(items), fh, ensure_ascii=False, indent=2)

    print("Escribiendo Excel...")
    freq_grid_df = pd.DataFrame({
        "index": np.arange(len(FREQ_GRID)),
        "frequency_hz": FREQ_GRID,
    })
    with pd.ExcelWriter(OUT / "dataset.xlsx", engine="openpyxl") as xw:
        # Excel tiene un limite de ~1M filas; filters_long puede pasarlo en futuro.
        df_long.head(1_048_575).to_excel(xw, sheet_name="filters", index=False)
        df_wide.to_excel(xw, sheet_name="devices", index=False)
        df_fr.to_excel(  xw, sheet_name="freq_response", index=False)
        freq_grid_df.to_excel(xw, sheet_name="freq_grid", index=False)
        pd.DataFrame({"readme": ["Ver README.md para la guia completa."]}).to_excel(
            xw, sheet_name="README", index=False
        )

    print("Escribiendo README...")
    write_readme(stats)
    print(f"Listo. Salida en: {OUT}")


if __name__ == "__main__":
    main()
