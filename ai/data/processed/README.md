# Spinorama EQ Dataset (consolidado)

Generado: 2026-05-25T14:19:55Z
Origen: `spinorama-develop/datas/eq/` (altavoces) y `spinorama-develop/datas/headphone_eq/` (auriculares).

## Resumen
- Dispositivos totales: **1206**  (altavoces: 1080, auriculares: 126)
- Variantes de EQ (filas en `devices_wide.csv`): **3280**
- Filtros biquad totales (filas en `filters_long.csv`): **51922**

## Archivos

| Archivo | Filas | Para que sirve |
|---|---|---|
| `filters_long.csv` | 51922 | Formato tidy: 1 fila = 1 filtro. Ideal para EDA, agregados y para entrenar modelos a nivel de filtro (p. ej. predecir tipo/Fc/Q a partir de la respuesta). |
| `devices_wide.csv` | 3280 | 1 fila = (dispositivo, variante de EQ) con los filtros desplegados en columnas (`f1_fc_hz`, `f1_gain_db`, ... hasta f31). Practico para regresiones clasicas tabulares. |
| `frequency_response.csv` | 3280 | **Lo mas importante para ML**: 1 fila = (dispositivo, variante) y la respuesta del EQ evaluada en 248 puntos log entre 20 Hz y 20 kHz (en dB). Vector de features de longitud fija. |
| `dataset.json` | 1206 | Mismo contenido en JSON anidado (un objeto por dispositivo con su lista de variantes y filtros). |
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
