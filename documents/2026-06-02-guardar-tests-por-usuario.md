# Guardar y gestionar tests por usuario

**Fecha:** 2026-06-02

Se añadió la capacidad de **guardar cada prueba de audio en la cuenta del
usuario** (PostgreSQL), nombrarla, y volver a ella en el futuro para verla,
editarla o borrarla. Antes la prueba solo vivía en memoria del navegador.

---

## Qué se hizo

### Backend (FastAPI + SQLAlchemy)
- **Nueva tabla `test_sessions`** ([models.py](../backend/app/models.py)):
  `id, user_id, name, results (JSON), created_at, updated_at`.
  Guarda los 11 resultados de la prueba juntos como JSON. Cuelga del usuario
  (relación con `User`, borrado en cascada).
- **Schemas** ([schemas.py](../backend/app/schemas.py)): `TestSessionCreate`,
  `TestSessionUpdate`, `TestSessionResponse`, `TestSessionSummary`.
- **Autenticación real** ([auth.py](../backend/app/routes/auth.py)): nueva
  dependencia `get_current_user` que lee el token JWT del header
  `Authorization: Bearer <token>` y obtiene el usuario. Ya no se confía en un
  `user_id` suelto.
- **Rutas CRUD** ([tests.py](../backend/app/routes/tests.py)), todas protegidas
  y limitadas a los tests del propio usuario:

  | Método | Ruta | Qué hace |
  |---|---|---|
  | POST | `/tests` | Crear test (nombre + resultados) |
  | GET | `/tests` | Listar mis tests (resumen) |
  | GET | `/tests/{id}` | Ver un test completo |
  | PUT | `/tests/{id}` | Renombrar y/o sobrescribir resultados |
  | DELETE | `/tests/{id}` | Borrar |

### Frontend (React) — [AudioTest.js](../audio-frontend/src/pages/AudioTest.js)
- **Pantalla de inicio:** lista "📁 Tus tests guardados" con botones para
  **cargar**, **renombrar** (✏️) y **borrar** (🗑️) cada uno; y el botón
  "🐉 Hacer un Test Nuevo".
- **Al terminar la prueba:** campo para ponerle **nombre libre** y botón para
  **guardar** (o **actualizar** si se cargó uno existente).
- **Editar a mano:** botones +/− por banda en "Detalle por Frecuencia" para
  ajustar puntajes sin rehacer la prueba (luego se guarda con "Guardar cambios").
- Las llamadas usan el token JWT del `localStorage` (lo deja el login).

---

## Qué tienes que hacer tú

1. **Reiniciar el backend.** La tabla `test_sessions` se crea sola al arrancar
   (`Base.metadata.create_all`), no hace falta migración manual:
   ```powershell
   cd backend
   ./venv/Scripts/python.exe -m uvicorn main:app --reload
   ```
   (Requiere PostgreSQL corriendo y `DATABASE_URL` en `backend/.env`.)
2. **Tener sesión iniciada** en el frontend (login) para que se guarden los
   tests; sin token, el guardado avisa "Inicia sesión para guardar".

---

## Decisiones tomadas (acordadas)
- Tabla nueva con resultados en JSON (no se tocaron las tablas viejas).
- Dueño del test sacado del **token JWT** (más seguro).
- "Modificar" incluye: renombrar, rehacer/sobrescribir, borrar y editar puntajes a mano.
- El test va **directo al usuario** (no se usa el concepto `Device`).

## Pendiente / futuro
- La escala del test es 0-10 y la IA (`ai/src/`) ya está alineada; falta
  **conectar** el resultado guardado con la generación de EQ (Pasos 3-4 del plan).
- Las rutas viejas de `audio.py` (`/audio/...`) siguen sin proteger; si se van a
  usar, conviene migrarlas también a `get_current_user`.
