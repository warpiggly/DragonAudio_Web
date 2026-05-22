from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.models import User, Device, AudioTest
from app.routes import auth, audio

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Audio Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(audio.router)

@app.get("/")
def home():
    return {"mensaje": "API Audio Platform funcionando"}