import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import engine, Base
from app.models import User, Device, AudioTest, TestSession
from app.routes import auth, audio, tests

Base.metadata.create_all(bind=engine)#fast api crea los modelos en la base de datos al iniciar la app, si no existen ya. Esto es util para desarrollo, pero en producción se recomienda usar migraciones con Alembic o similar.

app = FastAPI(title="Audio Platform API")


""""Como el front (localhost:3000) y el back (127.0.0.1:8000) están en puertos distintos, el navegador los trata como "orígenes diferentes" y bloquearía las peticiones por seguridad. CORS le dice al navegador: "déjalos hablar". El front manda el token en cada petición así:"""
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(audio.router)
app.include_router(tests.router)

# ----------------------------------------------------------------------------
# Servir el frontend (build de React) desde el mismo servidor.
# Esto hace que frontend y backend compartan ORIGEN, así no hay problemas de
# CORS / mixed content / loopback al exponerlo con ngrok o subirlo a AWS.
# Solo se activa si existe la carpeta build (genérala con: npm run build).
# ----------------------------------------------------------------------------
BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "audio-frontend", "build")

if os.path.isdir(BUILD_DIR):
    # Archivos estáticos generados por React (JS, CSS, imágenes).
    app.mount(
        "/static",
        StaticFiles(directory=os.path.join(BUILD_DIR, "static")),
        name="static",
    )

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str):
        # Si la ruta apunta a un archivo real del build, lo devuelve.
        # Si no (ej. /dashboard, /register), devuelve index.html para que
        # React Router resuelva la navegación en el navegador.
        candidate = os.path.join(BUILD_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(BUILD_DIR, "index.html"))
else:
    @app.get("/")
    def home():
        return {"mensaje": "API Audio Platform funcionando (build del frontend no encontrado)"}