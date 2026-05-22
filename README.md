# 🐉 Dragon Audio Web

> Plataforma web full-stack para realizar **pruebas auditivas**, **reproducir música** desde YouTube/SoundCloud y aplicar **procesamiento de audio profesional en tiempo real** (ecualizador, compresor, paneo estéreo, amplificador) directamente en el navegador.

Dragon Audio Web combina un **backend en FastAPI + PostgreSQL** (autenticación con JWT, registro de dispositivos y resultados de pruebas) con un **frontend en React 19** que aprovecha la **Web Audio API** y `getDisplayMedia` para capturar el audio de una pestaña y procesarlo en vivo, mostrando además un visualizador de espectro.

---

## 📋 Tabla de contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Stack tecnológico](#-stack-tecnológico)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Requisitos previos](#-requisitos-previos)
- [Instalación paso a paso](#-instalación-paso-a-paso)
  - [1. Clonar el repositorio](#1-clonar-el-repositorio)
  - [2. Configurar PostgreSQL](#2-configurar-postgresql)
  - [3. Configurar el backend (FastAPI)](#3-configurar-el-backend-fastapi)
  - [4. Configurar el frontend (React)](#4-configurar-el-frontend-react)
- [Cómo ejecutar la aplicación](#-cómo-ejecutar-la-aplicación)
- [Tutorial de uso](#-tutorial-de-uso)
- [Cómo funciona por dentro](#-cómo-funciona-por-dentro)
- [Endpoints de la API](#-endpoints-de-la-api)
- [Solución de problemas](#-solución-de-problemas)
- [Seguridad y advertencias](#-seguridad-y-advertencias)
- [Licencia](#-licencia)

---

## ✨ Características

- 🔐 **Autenticación segura** con registro/login, contraseñas hasheadas con `bcrypt` y tokens **JWT**.
- 🎧 **Prueba de audio** que reproduce tonos puros en 6 frecuencias estándar (250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz) y registra qué tan claro los escucha el usuario.
- 🎵 **Reproductor de música** con soporte para **YouTube** y **SoundCloud** embebidos.
- 🎛️ **Procesador de audio en tiempo real** sobre el audio compartido de la pestaña:
  - Ecualizador de 3 bandas (graves, medios, agudos)
  - Compresor dinámico (threshold y ratio ajustables)
  - Paneo estéreo (L ↔ R)
  - Ancho estéreo (mono → ampliado, con matriz de mezcla M/S)
  - Amplificador master hasta **6x** con advertencias de volumen peligroso
- 📊 **Visualizador de espectro** en `<canvas>` usando FFT (`AnalyserNode`).
- 🗄️ **Base de datos relacional** que guarda usuarios, dispositivos y resultados de cada prueba.

---

## 🏗️ Arquitectura

```
┌─────────────────────┐         HTTP/JSON         ┌────────────────────────┐
│  React 19 (CRA)     │ ◄──────────────────────► │  FastAPI (uvicorn)     │
│  Web Audio API      │     axios + JWT          │  SQLAlchemy ORM        │
│  getDisplayMedia    │                          │  bcrypt + PyJWT        │
└──────────┬──────────┘                          └────────────┬───────────┘
           │                                                   │
           │ Embebidos                                         │ psycopg2
           ▼                                                   ▼
   YouTube / SoundCloud                                ┌──────────────┐
                                                      │  PostgreSQL  │
                                                      └──────────────┘
```

---

## 🛠️ Stack tecnológico

### Backend
- **Python 3.10+**
- **FastAPI** + **Uvicorn**
- **SQLAlchemy** + **psycopg2-binary** (PostgreSQL)
- **bcrypt** + **PyJWT** (autenticación)
- **python-dotenv** (variables de entorno)
- **numpy**, **scipy**, **librosa**, **pandas**, **scikit-learn** (procesamiento de audio y análisis)

### Frontend
- **React 19** (Create React App)
- **react-router-dom 7**
- **axios**
- **Web Audio API** (`AudioContext`, `BiquadFilter`, `DynamicsCompressor`, `StereoPanner`, `ChannelSplitter/Merger`, `AnalyserNode`)
- **MediaDevices.getDisplayMedia** (captura de audio de pestaña)

---

## 📁 Estructura del proyecto

```
Dragon Audio Web/
├── README.md
├── backend/
│   ├── main.py                 # Punto de entrada FastAPI + CORS
│   ├── requirements.txt        # Dependencias Python
│   ├── .env                    # Variables de entorno (NO subir a git)
│   └── app/
│       ├── database.py         # Conexión SQLAlchemy + engine
│       ├── models.py           # User, Device, AudioTest
│       ├── schemas.py          # Esquemas Pydantic
│       └── routes/
│           ├── auth.py         # /auth/register, /auth/login
│           └── audio.py        # /audio/device, /audio/test, /audio/results
│
└── audio-frontend/
    ├── package.json
    ├── public/
    └── src/
        ├── App.js              # Router principal
        ├── index.js
        └── pages/
            ├── Login.js        # Inicio de sesión
            ├── Register.js     # Registro
            ├── Dashboard.js    # Menú principal
            ├── AudioTest.js    # Prueba auditiva por frecuencias
            └── MusicPlayer.js  # Reproductor + procesador de audio
```

---

## 📦 Requisitos previos

Antes de instalar, asegúrate de tener:

| Herramienta    | Versión mínima | Descarga                                                  |
|----------------|----------------|-----------------------------------------------------------|
| **Python**     | 3.10+          | https://www.python.org/downloads/                         |
| **Node.js**    | 18+ (LTS)      | https://nodejs.org/                                       |
| **npm**        | 9+ (incluido)  | —                                                         |
| **PostgreSQL** | 13+            | https://www.postgresql.org/download/                      |
| **Git**        | Cualquiera     | https://git-scm.com/                                      |

Navegador recomendado para el ecualizador: **Chrome, Edge o Brave** (Firefox y Safari **no** soportan `getDisplayMedia` con audio de pestaña).

---

## 🚀 Instalación paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/<tu-usuario>/dragon-audio-web.git
cd dragon-audio-web
```

### 2. Configurar PostgreSQL

Abre `psql` (o pgAdmin) y ejecuta:

```sql
CREATE DATABASE audio_platform;
CREATE USER deivy WITH PASSWORD 'david12345';
GRANT ALL PRIVILEGES ON DATABASE audio_platform TO deivy;
```

> ⚠️ Puedes usar otro nombre de usuario/contraseña/BD; solo recuerda actualizar el archivo `.env` en el siguiente paso.

Las **tablas se crean automáticamente** la primera vez que arranca el backend (`Base.metadata.create_all(bind=engine)` en `main.py`).

### 3. Configurar el backend (FastAPI)

```powershell
cd backend

# Crear entorno virtual
python -m venv venv

# Activar entorno virtual (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# (En Linux/Mac usar: source venv/bin/activate)

# Instalar dependencias
pip install -r requirements.txt
```

Crear el archivo **`backend/.env`** con tus credenciales:

```env
DATABASE_URL=postgresql://deivy:david12345@127.0.0.1:5432/audio_platform
SECRET_KEY=cambia-esto-por-una-clave-larga-y-aleatoria
```

> 🔒 **Importante**: en producción, genera una `SECRET_KEY` segura (por ejemplo con `python -c "import secrets; print(secrets.token_urlsafe(64))"`) y nunca subas el archivo `.env` al repositorio.

### 4. Configurar el frontend (React)

En otra terminal:

```bash
cd audio-frontend
npm install
```

(Si prefieres `pnpm`, el repo incluye `pnpm-lock.yaml` y `pnpm-workspace.yaml`, así que también funciona `pnpm install`.)

---

## ▶️ Cómo ejecutar la aplicación

Necesitas **dos terminales abiertas** simultáneamente.

### Terminal 1 — Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload
```

El backend queda escuchando en **http://127.0.0.1:8000**.
La documentación interactiva de la API estará en **http://127.0.0.1:8000/docs** (Swagger UI) y **http://127.0.0.1:8000/redoc**.

### Terminal 2 — Frontend

```bash
cd audio-frontend
npm start
```

El frontend abrirá automáticamente **http://localhost:3000** en tu navegador.

---

## 📘 Tutorial de uso

### 1️⃣ Registrarse

1. Abre http://localhost:3000.
2. Haz clic en **"Regístrate"**.
3. Rellena nombre, email y contraseña → **Registrarse**.
4. Serás redirigido al login.

### 2️⃣ Iniciar sesión

1. Introduce el email y contraseña que acabas de crear.
2. Haz clic en **Entrar**. El token JWT se guarda en `localStorage` y te lleva al Dashboard.

### 3️⃣ Dashboard

Desde aquí tienes dos accesos:
- 🎧 **Prueba de Audio**
- 🎵 **Reproductor de Música**

### 4️⃣ Prueba de Audio

1. Conéctate **audífonos** (recomendado para mayor precisión).
2. Pulsa **"▶ Reproducir Tono"**.
3. Sonará una onda senoidal pura de 2 segundos.
4. Califica del **1 al 5**:
   - `1` = No la escucho
   - `5` = La escucho muy clara
5. La app avanza automáticamente por las 6 frecuencias: **250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz**.
6. Al final verás tus resultados.

> 💡 Esta prueba ayuda a detectar a qué rango de frecuencias tienes menor sensibilidad auditiva (audiograma simplificado).

### 5️⃣ Reproductor de Música + Ecualizador

#### a) Cargar una pista

- **YouTube**: pega un enlace (`https://www.youtube.com/watch?v=...` o `https://youtu.be/...`) y presiona **Cargar**.
- **SoundCloud**: pega un enlace de pista y presiona **Cargar**.

#### b) Activar el procesador de audio

1. Pulsa **"▶️ Activar (compartir pestaña con audio)"**.
2. El navegador abrirá un diálogo para compartir pantalla:
   - Selecciona la pestaña **"Pestaña de Chrome"** (o tu navegador).
   - Elige **la misma pestaña** donde estás escuchando.
   - ✅ **Marca la casilla "Compartir audio de la pestaña"** (¡crítico!).
   - Pulsa **Compartir**.
3. Verás el **visualizador de espectro** moverse con la música.

#### c) Ajustar el sonido

- **Ecualizador**: mueve **Bajos**, **Medios** y **Agudos** entre `-12 dB` y `+12 dB`.
- **Compresor**: baja el **Threshold** para comprimir más; sube el **Ratio** para aplanar los picos.
- **Paneo**: desplaza el sonido a izquierda (`-1`) o derecha (`+1`).
- **Ancho estéreo**: `0` = mono, `1` = normal, `2` = súper amplio.
- **Volumen master**: `100` = original, hasta `600` = amplificado x6.

> ⚠️ **Importante**: baja el volumen del reproductor de YouTube/SoundCloud original — el procesador toca su propia versión filtrada. Si no lo bajas, oirás ambas señales mezcladas.

#### d) Detener

Pulsa **"⏹️ Detener"** para liberar el stream y cerrar el `AudioContext`.

---

## 🧠 Cómo funciona por dentro

### Backend

- **`main.py`** crea la app FastAPI, habilita CORS para cualquier origen y registra los routers `auth` y `audio`. `Base.metadata.create_all()` crea automáticamente las tablas `users`, `devices` y `audio_tests` si no existen.
- **`app/database.py`** carga `DATABASE_URL` desde `.env`, crea el engine de SQLAlchemy y expone `get_db()` como dependencia para las rutas.
- **`app/models.py`** define tres tablas relacionadas:
  - `User` (id, email, password hasheado, name, created_at)
  - `Device` (id, name, device_type, user_id)
  - `AudioTest` (id, device_id, frequency, volume, user_response, created_at)
- **`app/routes/auth.py`** registra usuarios (hash con bcrypt) y emite un **JWT** firmado con `SECRET_KEY` al hacer login.
- **`app/routes/audio.py`** expone endpoints para registrar dispositivos, guardar mediciones de pruebas y consultar resultados por dispositivo.

### Frontend

- **`App.js`** define cinco rutas con `react-router-dom`: `/`, `/register`, `/dashboard`, `/test`, `/music`.
- **`Login.js` / `Register.js`** llaman a `axios.post` contra `127.0.0.1:8000/auth/...` y guardan el token + usuario en `localStorage`.
- **`AudioTest.js`** usa **`AudioContext` + `OscillatorNode`** para generar tonos senoidales puros que duran 2 segundos por frecuencia.
- **`MusicPlayer.js`** es la pieza más compleja:
  1. Llama a `navigator.mediaDevices.getDisplayMedia({ video: true, audio: { ... } })` para que el usuario comparta una pestaña **con su audio**.
  2. Descarta la pista de video y conserva solo la pista de audio.
  3. Crea un `AudioContext` a **48 kHz** y construye una cadena de nodos:
     ```
     source → bassFilter (lowshelf 200 Hz)
            → midFilter  (peaking 1 kHz)
            → trebleFilter (highshelf 3 kHz)
            → compressor (DynamicsCompressor)
            → splitter (L/R)
               ├─ gLL ─┐
               ├─ gLR ─┤
               ├─ gRL ─┤
               └─ gRR ─┘  → merger (matriz M/S para ancho estéreo)
            → panner (StereoPanner)
            → analyser (FFT 256, para el visualizador)
            → masterGain (volumen 0–6x)
            → ctx.destination
     ```
  4. El **ancho estéreo** se calcula con la matriz:
     - `newL = L · (1+w)/2 + R · (1-w)/2`
     - `newR = R · (1+w)/2 + L · (1-w)/2`
     Donde `w=0` colapsa a mono, `w=1` deja el estéreo original y `w=2` lo amplía.
  5. El **visualizador** usa `requestAnimationFrame` + `analyser.getByteFrequencyData()` para dibujar barras coloreadas por `hsl()` en función de la amplitud.
  6. Los `useEffect` actualizan en tiempo real los parámetros (`gain`, `threshold`, `ratio`, `pan`, `width`, `volume`) cuando mueves cualquier slider, **sin reconstruir el grafo**.

---

## 🔌 Endpoints de la API

| Método | Ruta                      | Descripción                                              |
|--------|---------------------------|----------------------------------------------------------|
| `GET`  | `/`                       | Health check (`{"mensaje": "API Audio Platform..."}`)   |
| `POST` | `/auth/register`          | Crea un nuevo usuario                                    |
| `POST` | `/auth/login`             | Devuelve `{ token, user }`                               |
| `POST` | `/audio/device`           | Registra un dispositivo (audífonos, parlante, etc.)      |
| `POST` | `/audio/test`             | Guarda un resultado individual de prueba                 |
| `GET`  | `/audio/results/{id}`     | Lista los resultados de un dispositivo                   |

Documentación interactiva completa: http://127.0.0.1:8000/docs

---

## 🧰 Solución de problemas

| Problema | Causa probable / solución |
|----------|---------------------------|
| `psycopg2.OperationalError: connection refused` | PostgreSQL no está corriendo. Inicia el servicio. |
| `password authentication failed for user "deivy"` | Las credenciales del `.env` no coinciden con las de la BD. |
| `ModuleNotFoundError: No module named 'fastapi'` | No activaste el `venv` antes de `pip install -r requirements.txt`. |
| Login devuelve `401 Credenciales incorrectas` | Email/contraseña incorrectos. Asegúrate de haberte registrado primero. |
| El frontend no llega al backend (CORS / Network Error) | Verifica que `uvicorn` esté arriba en el puerto **8000** y que la URL `http://127.0.0.1:8000` sea accesible. |
| El ecualizador dice **"No se compartió audio"** | Tienes que marcar la casilla **"Compartir audio de la pestaña"** en el diálogo de Chrome. |
| El ecualizador no arranca en Firefox/Safari | Estos navegadores **no soportan** captura de audio de pestaña con `getDisplayMedia`. Usa Chrome, Edge o Brave. |
| Oigo la canción duplicada | Baja el volumen del reproductor original (YouTube/SoundCloud). El procesador reproduce **su propia versión** filtrada. |
| El visualizador queda en negro | El stream se cerró o nunca se compartió audio. Pulsa **Detener** y vuelve a **Activar**. |
| `npm start` falla con error de OpenSSL en Node 17+ | Ejecuta `set NODE_OPTIONS=--openssl-legacy-provider` (Windows) antes de `npm start`. |

---

## ⚠️ Seguridad y advertencias

- **Volumen master > 300**: la app muestra un aviso 🚨 — escuchar más de 85 dB durante períodos prolongados puede causar **pérdida auditiva permanente** y dañar audífonos/parlantes por *clipping*.
- **`SECRET_KEY` en .env**: nunca uses el valor de ejemplo en producción. Genera una clave aleatoria larga.
- **CORS `allow_origins=["*"]`**: cómodo para desarrollo, pero en producción restringe a tu dominio específico.
- **Contraseñas**: se hashean con `bcrypt`, nunca se guardan en texto plano.
- **JWT**: el token se almacena en `localStorage`; si te preocupa XSS, considera moverlo a una cookie `HttpOnly` antes de salir a producción.

---

## 📄 Licencia

Este proyecto fue desarrollado como **trabajo final académico — CESDE**.
Puedes adaptarlo libremente para fines educativos y personales.

---

<p align="center">Hecho con 🐉 y ❤️ — Dragon Audio Web</p>
