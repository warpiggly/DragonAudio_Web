# Plan de trabajo — DragonAudio

> Hoja de ruta para conectar todo el proyecto de punta a punta.
> Fecha: 2026-05-29

---

## Decisiones tomadas

- **Qué mide la prueba:** el **DISPOSITIVO** (cómo reproduce las frecuencias el audífono/parlante), no la audición de la persona. Coincide con el PDF y con el dataset Spinorama.
- **Alcance:** todo **funcional end-to-end** (test → backend → IA genera EQ → se aplica en el navegador).
- **Tiempo:** trabajo en solitario, varias semanas → lo hacemos bien y por capas.
- **Resolución del test:** ~**10 tonos** (bandas de octava ISO) → corto y confiable, sin fatiga auditiva.
- **Resolución del EQ:** **31 bandas ISO** (1/3 de octava) → ecualizador gráfico profesional.
- **Puente:** se interpolan los 10 puntos del test sobre la curva de 248 puntos del dataset, y de ahí salen las 31 bandas.

---

## Por qué este flujo es coherente

El dataset Spinorama son **curvas de dispositivos → filtros de dispositivos**. Como la prueba
mide el dispositivo, la curva reconstruida es del mismo tipo que la de entrenamiento.
Sin desajuste de dominio:

```
Usuario califica claridad 1-5 por frecuencia   (AudioTest.js — ya existe)
        v
Reconstruir curva aproximada del dispositivo    (features/audiometry.py — por crear)
        v
IA 2 genera filtros biquad                       (models/inverse_eq.py — del notebook)
        v   <- mismo dominio que Spinorama
IA 1 verifica si el EQ mejora el score           (models/score_predictor.py — del notebook)
        v
Aplicar filtros en vivo                          (MusicPlayer.js — ya tiene la cadena)
```

---

## Qué se reaprovecha del notebook `EQ_Personalizado.ipynb`

| Pieza del notebook | Destino | Cambios |
|---|---|---|
| IA 1 — Ridge (predictor de mejora) | `ai/src/models/score_predictor.py` | Migrar, quitar Colab |
| IA 2 — Random Forest (genera filtros) | `ai/src/models/inverse_eq.py` | Migrar, ampliar a más filtros |
| `umbrales_a_curva` | `ai/src/features/audiometry.py` | Reenfocar: claridad -> curva del dispositivo |
| Generación de tonos | Ya cubierto por `AudioTest.js` | Ampliar a 10 frecuencias ISO |
| Export JSON del perfil | Backend `AudioProfile` | Pasar a base de datos |

Se descarta: `google.colab.files` y el `input()` interactivo (no aplican en web).

---

## Pasos a seguir

### Paso 1 — Migrar el notebook a `ai/src/`
- [ ] `features/audiometry.py` — convierte respuestas 1-5 en curva de 248 puntos (pieza inicial).
- [ ] `models/inverse_eq.py` — curva -> filtros biquad (IA 2).
- [ ] `models/score_predictor.py` — curva -> mejora de score (IA 1).
- [ ] `train/train_inverse_eq.py` y `train/train_score_predictor.py` — scripts de entrenamiento.
- [ ] Split **por dispositivo** (no por variante) para evitar fugas de datos.

### Paso 2 — Entrenar y guardar artefactos
- [ ] Generar los `.joblib` en `ai/artifacts/`.
- [ ] Registrar métricas (MAE, R²) para la sustentación.

### Paso 3 — Backend
- [ ] Tabla nueva `AudioProfile(id, user_id, device_id, model_version, filters_json, created_at)`.
- [ ] `services/inference_service.py` — carga el modelo **una sola vez** al arrancar.
- [ ] Endpoint `POST /recommendations/auto-eq/{device_id}`.
- [ ] `audio_dsp/biquad.py` — respuesta IIR (copia mínima de `build_dataset.py`).

### Paso 4 — Frontend
- [ ] Ampliar `AudioTest.js` a 10 frecuencias ISO.
- [ ] Al terminar el test, pedir el EQ a la IA y mostrarlo.
- [ ] Ecualizador gráfico de **31 bandas ISO** que aplica los filtros en vivo
      (extender la cadena de biquads de `MusicPlayer.js` a N filtros).

### Paso 5 — Nube (entrega final)
- [ ] Dockerizar backend y frontend.
- [ ] Desplegar en AWS (EC2 + RDS + S3).
- [ ] Documentar el despliegue.

---

## Bandas de referencia (ISO)

- **Test (10, octava):** 31, 63, 125, 250, 500, 1k, 2k, 4k, 8k, 16k
- **EQ (31, 1/3 octava):** 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315,
  400, 500, 630, 800, 1k, 1.25k, 1.6k, 2k, 2.5k, 3.15k, 4k, 5k, 6.3k, 8k, 10k, 12.5k, 16k, 20k

---

## Próximo paso inmediato

Empezar por **`ai/src/features/audiometry.py`** (la conversión de respuestas a curva):
es código corto, no entrena nada, y muestra el puente entre la app y la IA.
