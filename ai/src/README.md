# `ai/src/` — Migración del notebook a código

Esto es el **Paso 1** del plan (`documents/plan_dragonaudio.md`): pasar la
lógica del notebook `EQ_Personalizado.ipynb` a archivos Python ordenados.

> **Importante:** todavía NO está conectado al backend ni al frontend.
> Son piezas sueltas, probadas por separado, con los "ganchos" listos para
> conectarlas más adelante (Pasos 3 y 4 del plan).

---

## Qué hice (mapa del notebook → archivos)

| En el notebook | Ahora vive en | Qué cambió |
|---|---|---|
| Celdas IA 1 (Ridge) | [models/score_predictor.py](models/score_predictor.py) | Clase con `fit/predict/evaluate/save/load`. Mismo modelo (Ridge α=100). |
| Celdas IA 2 (Random Forest) | [models/inverse_eq.py](models/inverse_eq.py) | Clase igual. N.º de filtros configurable (antes fijo en 7). |
| `umbrales_a_curva` | [features/audiometry.py](features/audiometry.py) | Reenfocado: ahora recibe **claridad 1-5** (lo que devuelve `AudioTest.js`), no "umbral 0-100%". |
| `pd.read_csv` + `pd.merge` de las celdas | [data/datasets.py](data/datasets.py) | Carga centralizada + **split por dispositivo** (evita leakage). |
| Entrenamiento dentro de celdas | [train/train_score_predictor.py](train/train_score_predictor.py) y [train/train_inverse_eq.py](train/train_inverse_eq.py) | Scripts que entrenan, miden MAE/R² y guardan `.joblib`. |
| Rutas/constantes sueltas | [config.py](config.py) | Rutas, malla de 248 frecuencias, bandas ISO, semilla. |

**Se descartó del notebook** (no aplica fuera de Colab):
`google.colab.files`, el `input()` interactivo de la prueba, la generación de
tonos con `IPython.Audio` (eso ya lo hace el frontend) y las gráficas
`matplotlib` (eran para explorar, no para producción).

---

## Estructura

```
ai/src/
├── config.py              rutas + constantes compartidas
├── data/
│   ├── build_dataset.py   (ya existía) genera los CSV desde Spinorama
│   └── datasets.py        carga los CSV y arma X/y + split por dispositivo
├── features/
│   └── audiometry.py      claridad 1-5  →  curva de 248 puntos
├── models/
│   ├── score_predictor.py IA 1 (Ridge)
│   └── inverse_eq.py      IA 2 (Random Forest)
└── train/
    ├── train_score_predictor.py
    └── train_inverse_eq.py
```

El flujo encaja así (igual que el diagrama del plan):

```
AudioTest.js (claridad 1-5)
   → audiometry.clarity_to_curve()   → curva 248 pts
   → InverseEQ.predict_filters()      → filtros biquad
   → ScorePredictor.predict()         → ¿mejora? (verificación)
```

---

## Qué tienes que hacer tú

1. **Instalar dependencias** (una sola vez):
   ```powershell
   cd "ai"
   pip install -r requirements.txt
   ```

2. **Tener los datos** en `ai/data/processed/`. Si no están, genéralos:
   ```powershell
   python -m ai.src.data.build_dataset
   ```
   (Ya existen `frequency_response.csv` y `devices_wide.csv`, así que
   probablemente no haga falta.)

3. **Entrenar los modelos** (desde la raíz del proyecto):
   ```powershell
   python -m ai.src.train.train_score_predictor
   python -m ai.src.train.train_inverse_eq
   ```
   Cada uno imprime MAE/R² (apúntalos para la sustentación) y deja el modelo
   en `ai/artifacts/*.joblib`.

> Nota: los comandos se ejecutan **desde la raíz del proyecto** (la carpeta que
> contiene `ai/`), porque los módulos usan imports de paquete (`ai.src...`).

---

## Cómo se conectará después (ganchos ya listos)

Nada de esto hay que tocarlo ahora; queda anotado para los Pasos 3 y 4:

- **Backend (Paso 3):** cargar los `.joblib` una sola vez con
  `InverseEQ.load(...)` y `ScorePredictor.load(...)`, y exponer el endpoint
  `POST /recommendations/auto-eq/{device_id}`. La conversión de la prueba ya
  está en `audiometry.clarity_to_curve()`.
- **Frontend (Paso 4):** `AudioTest.js` ya devuelve `[{frequency, score}]`, que
  es exactamente lo que `clarity_to_curve()` acepta. `InverseEQ.predict_filters()`
  devuelve los filtros en el formato `{type, fc_hz, gain_db, q}` que necesita el
  ecualizador de `MusicPlayer.js`.

---

## Decisiones que tomé al migrar

- **Claridad 1-5 en vez de umbral 0-100%:** el plan pide reenfocar la prueba a
  "claridad" y `AudioTest.js` ya entrega 1-5, así que `audiometry.py` recibe eso
  directamente. Mapeo: claridad 5 → 0 dB, claridad 1 → −12 dB (mismo rango que
  el notebook). El máximo es un parámetro (`max_correction_db`) por si se ajusta.
- **Split por dispositivo:** lo exige el plan para no mezclar el mismo
  dispositivo en train y test. Se hace con `GroupShuffleSplit` agrupando por
  `device_name`.
- **7 filtros por defecto:** igual que el notebook, pero ahora es configurable
  (`config.N_FILTERS`, hasta 31) porque `devices_wide.csv` trae columnas f1..f31.
- **sklearn (no deep learning):** se mantiene Ridge + Random Forest del
  notebook; son rápidos, explicables y suficientes para el dataset.
