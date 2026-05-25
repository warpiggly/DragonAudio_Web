# DragonAudio — Modulo de IA

Este directorio aloja todo lo relacionado a **datos**, **entrenamiento** y **modelos**
del proyecto DragonAudio. Esta intencionalmente separado del `backend/` para que:

- El backend se mantenga liviano y rapido de desplegar.
- Los datos crudos no viajen en cada imagen Docker del servicio.
- El trabajo de investigacion (notebooks, experimentos) sea reproducible por si mismo.

El contrato entre `ai/` y `backend/` es un archivo: el `.joblib` (o `.onnx`)
generado en `ai/artifacts/` se copia a `backend/app/ml_artifacts/` y el servicio
lo carga al iniciar.

---

## Estructura

```
ai/
├── data/
│   ├── raw/              # Datos sin tocar (spinorama-develop/, etc.)
│   ├── interim/          # Datos parcialmente procesados
│   ├── processed/        # Dataset final listo para ML
│   └── external/         # Referencias externas (PDFs, papers)
├── notebooks/            # EDA y prototipos
├── src/
│   ├── data/             # Pipelines de datos (build_dataset.py)
│   ├── features/         # Feature engineering
│   ├── models/           # Definicion de modelos
│   ├── train/            # Scripts de entrenamiento
│   ├── evaluation/       # Metricas y validacion
│   └── inference/        # Carga y prediccion (lo que el backend importara)
├── artifacts/            # Modelos entrenados versionados
├── configs/              # Hiperparametros (YAML)
├── requirements.txt
└── README.md
```

---

## Setup

Recomendado crear un entorno separado del backend (las dependencias son pesadas).

```powershell
# Desde la raiz del proyecto
python -m venv ai\.venv
ai\.venv\Scripts\Activate.ps1
pip install -r ai\requirements.txt
```

---

## Pipeline de datos

El dataset principal se construye a partir de los archivos de Spinorama en
`data/raw/spinorama-develop/datas/`.

```powershell
# Desde la raiz del proyecto
python ai\src\data\build_dataset.py
```

Salidas en `ai/data/processed/`:

| Archivo | Para que sirve |
|---|---|
| `frequency_response.csv` | Vector de features de longitud fija (248 puntos). **El input/target principal para ML.** |
| `devices_wide.csv` | 1 fila por (dispositivo, variante) con filtros desplegados en columnas. |
| `filters_long.csv` | Formato tidy: 1 fila por filtro biquad. |
| `dataset.json` | Mismo contenido en JSON anidado. |
| `dataset.xlsx` | Excel multi-hoja. |

Ver `data/processed/README.md` para el diccionario completo de columnas.

---

## Roadmap de modelos

1. **Clusterer de perfiles** (`src/models/profile_clusterer.py`)
   - PCA + KMeans sobre `frequency_response.csv`.
   - Output: 4-6 clusters de "tipos de dispositivo".
   - Uso desde el backend: clasificar un dispositivo nuevo y arrancar con un preset.

2. **Auto-EQ inverso** (`src/models/inverse_eq.py`)
   - Entrada: curva de respuesta del dispositivo (248 puntos).
   - Salida: hasta N filtros biquad `(type, fc, gain, q)`.
   - Es el corazon de la fase 5 del proyecto.

3. **Score predictor** (`src/models/score_predictor.py`)
   - Regresion `frequency_response -> score_with_eq`.
   - Para evaluar la calidad de un EQ generado sin un test ABX humano.

---

## Como exportar un modelo al backend

```python
import joblib
from pathlib import Path

# tras entrenar
joblib.dump(model, "ai/artifacts/profile_clusters_v1.joblib")

# copiar a backend
# (manual por ahora, mas adelante un script o S3)
```

El backend lo carga en `backend/app/services/inference_service.py` al startup
y lo usa desde los endpoints de `backend/app/routes/recommendations.py`.

---

## Notas

- Los notebooks son para explorar. **No** importarlos desde codigo de produccion.
- Cualquier funcion reutilizable de un notebook debe migrar a `src/`.
- `data/raw/` no se sube al repositorio si supera unos pocos MB. Documentar
  como obtener los datos en este README.
