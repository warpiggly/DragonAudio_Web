# Análisis DragonAudio #1 — Organización del backend e introducción de la capa de IA

> Análisis técnico inicial como ingeniero IA sobre el estado actual del proyecto y la propuesta de encarpetado para incorporar la IA y sus datos.
> Fecha: 2026-05-25
> Contexto leído: `Trabajo Final.pdf`, `build_dataset.py`, estructura actual del repo.

---

## 1. Diagnóstico rápido

Lo que tienes hoy en el repositorio:

- `backend/` → FastAPI con `users`, `devices`, `audio_tests` (cubre bien las fases 1-3 del PDF).
- `audio-frontend/` → React.
- `build_dataset.py` (en raíz) → ya generaste un dataset ML real desde Spinorama:
  - `filters_long.csv`
  - `devices_wide.csv`
  - `frequency_response.csv` (vector de 248 puntos, **ideal como feature vector**)
- `dataset_compiled/` (en raíz) → outputs del pipeline.
- `spinorama-develop/` (en raíz) → datos crudos de origen.

**Problema:** tres responsabilidades distintas (datos crudos, entrenamiento, servidor) están mezcladas en la raíz. Se va a complicar cuando:

1. Entrenes modelos reales.
2. Dockerices el backend (no quieres meter varios GB de datos crudos en la imagen).
3. Despliegues en AWS (EC2/RDS/S3 según el PDF).

---

## 2. Recomendación: carpeta `ai/` separada del `backend/`

Mantener el backend **liviano y de servir**. Mover todo lo de IA y datos a `ai/`. El backend solo carga el modelo ya entrenado (un `.joblib` o `.onnx`) y lo usa en un endpoint.

### Estructura propuesta

```
Trabjo Final Cesde/
├── backend/                          # SERVIR (FastAPI, rápido)
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   ├── models.py                 # + AudioProfile, Recommendation
│   │   ├── schemas.py
│   │   ├── core/
│   │   │   ├── config.py             # settings + env
│   │   │   └── security.py           # JWT, hashing
│   │   ├── routes/
│   │   │   ├── auth.py
│   │   │   ├── audio.py
│   │   │   ├── profiles.py           # GET/POST perfiles
│   │   │   └── recommendations.py    # POST /recommend/auto-eq
│   │   ├── services/                 # lógica de negocio
│   │   │   ├── test_service.py
│   │   │   ├── profile_service.py
│   │   │   └── inference_service.py  # carga modelo, predice
│   │   ├── audio_dsp/                # biquads en tiempo real (sin sklearn)
│   │   │   ├── biquad.py             # copia mínima de build_dataset.py
│   │   │   └── presets.py
│   │   └── ml_artifacts/             # SOLO los .joblib/.onnx en producción
│   │       └── inverse_eq_v1.joblib
│   ├── requirements.txt              # ligero: fastapi, sqlalchemy, joblib, numpy
│   ├── Dockerfile
│   └── tests/
│
├── ai/                               # ENTRENAR / INVESTIGAR (pesado)
│   ├── README.md
│   ├── requirements.txt              # pandas, sklearn, jupyter, matplotlib, torch?
│   ├── data/
│   │   ├── raw/
│   │   │   └── spinorama-develop/    # ← mover acá
│   │   ├── interim/
│   │   ├── processed/                # ← mover dataset_compiled/ acá
│   │   │   ├── frequency_response.csv
│   │   │   ├── devices_wide.csv
│   │   │   └── filters_long.csv
│   │   └── external/                 # listenerpreference.pdf de referencia
│   ├── notebooks/                    # EDA, prototipos
│   │   ├── 01_eda_spinorama.ipynb
│   │   ├── 02_clustering_perfiles.ipynb
│   │   └── 03_inverse_eq_baseline.ipynb
│   ├── src/
│   │   ├── data/
│   │   │   ├── build_dataset.py      # ← mover el actual acá
│   │   │   └── biquad.py             # respuesta IIR (compartible con backend)
│   │   ├── features/
│   │   │   └── audiometry.py         # convierte respuestas user (1-5) → curva
│   │   ├── models/
│   │   │   ├── inverse_eq.py         # respuesta → filtros (auto-EQ)
│   │   │   ├── profile_clusterer.py  # PCA/UMAP/KMeans → perfiles
│   │   │   └── recommender.py        # recomienda preset por perfil
│   │   ├── train/
│   │   │   ├── train_inverse_eq.py
│   │   │   └── train_clusterer.py
│   │   ├── evaluation/
│   │   │   └── metrics.py
│   │   └── inference/
│   │       └── predict.py            # API que el backend importará (opcional)
│   ├── artifacts/                    # modelos versionados
│   │   ├── inverse_eq_v1.joblib
│   │   └── profile_clusters_v1.joblib
│   └── configs/
│       └── inverse_eq.yaml           # hiperparámetros
│
├── docs/
│   ├── Trabajo Final.pdf             # ← mover
│   └── listenerpreference.pdf        # ← mover
│
├── audio-frontend/
└── infra/                            # más adelante
    ├── docker-compose.yml
    └── aws/
```

---

## 3. Por qué así (y no todo dentro de `backend/`)

1. **Dos entornos Python distintos.**
   - Backend: `numpy + joblib + fastapi + sqlalchemy` → liviano.
   - AI: `pandas + sklearn + jupyter + matplotlib + (torch opcional)` → pesado.
   - Resultado: imagen Docker del backend pasa de ~3 GB a ~200 MB.

2. **Los datos no pertenecen al servicio.**
   `spinorama-develop/` y `dataset_compiled/` son insumos de **entrenamiento**, no de **runtime**. No deben viajar en cada deploy.

3. **El contrato entre `ai/` y `backend/` es un archivo.**
   Entrenas en `ai/`, copias el `.joblib` resultante a `backend/app/ml_artifacts/` (idealmente desde S3 con versión), y listo. Esto es un "model registry" simplificado.

4. **Reproducibilidad académica.**
   El jurado puede correr los notebooks de `ai/notebooks/` sin tocar el backend, y al revés.

---

## 4. Flujo de IA que ya estás habilitando

Con lo que tienes en `build_dataset.py`, ya estás listo para entrenar:

### 4.1 Auto-EQ inverso (lo más valioso — fase 5 del PDF)
- **Entrada:** curva de respuesta del dispositivo del usuario (reconstruida desde `AudioTest.user_response`).
- **Salida:** lista de filtros biquad `(type, fc, gain, q)`.
- **Datos:** Spinorama te da pares (respuesta → filtros) listos para entrenar.

### 4.2 Clusterer de perfiles (fase 6)
- PCA + KMeans sobre `frequency_response.csv` para descubrir 4-6 "tipos de dispositivo".
- Cada usuario nuevo cae en un cluster y arranca con el preset de ese cluster.

### 4.3 Score predictor
- Regresión `frequency_response → score_with_eq` para evaluar la calidad de un EQ generado.

---

## 5. Cambios menores recomendados en el backend

- **`models.py`** necesita una tabla nueva:
  ```python
  AudioProfile(id, user_id, device_id, model_version, filters_json, created_at)
  ```
  para guardar el EQ generado por la IA.

- **Endpoint nuevo `POST /recommendations/auto-eq/{device_id}`** que:
  1. Lee `AudioTest`s del dispositivo.
  2. Llama `inference_service.predict_filters(curve)`.
  3. Guarda como `AudioProfile`.
  4. Devuelve los filtros al frontend para aplicarlos con Web Audio API.

- **`inference_service.py`** carga el modelo **una sola vez** al arrancar FastAPI (en el evento `startup`), no por request.

- El módulo **`audio_dsp/biquad.py`** del backend puede ser una copia mínima del `_biquad_response` que ya tienes en `build_dataset.py`. Más adelante, si quieres evitar duplicación, lo extraes a un paquete `audio-core` instalable en ambos lados.

---

## 6. Próximos pasos sugeridos

1. Crear la estructura `ai/` con subcarpetas (`data/raw`, `data/processed`, `src/data`, `src/models`, `notebooks`, `artifacts`, `configs`).
2. Mover con `git mv`:
   - `build_dataset.py` → `ai/src/data/build_dataset.py`
   - `dataset_compiled/` → `ai/data/processed/`
   - `spinorama-develop/` → `ai/data/raw/spinorama-develop/`
   - PDFs → `docs/`
3. Ajustar las rutas dentro de `build_dataset.py` (las constantes `ROOT` y `OUT`).
4. Crear `ai/requirements.txt` y `ai/README.md`.
5. Crear notebook inicial `01_eda_spinorama.ipynb` para explorar `frequency_response.csv`.
6. Definir baseline del primer modelo (auto-EQ inverso o clusterer).

---

*Fin del análisis #1.*
