from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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

@app.get("/")
def home():
    return {"mensaje": "API Audio Platform funcionando"}