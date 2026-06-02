from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserResponse(BaseModel):
    id: int
    email: str
    name: str

class DeviceCreate(BaseModel):
    name: str
    device_type: str

class AudioTestCreate(BaseModel):
    device_id: int
    frequency: float
    volume: float
    user_response: int

# --- Sesiones de prueba (test nombrado por usuario) ---

class TestSessionCreate(BaseModel):
    name: str
    results: List[Any]          # lista de bandas: [{"hz":40,"score":7,...}, ...]

class TestSessionUpdate(BaseModel):
    name: Optional[str] = None      # renombrar
    results: Optional[List[Any]] = None  # rehacer/sobrescribir o editar puntajes

class TestSessionResponse(BaseModel):
    id: int
    name: str
    results: List[Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True   # permite construir desde el objeto ORM

class TestSessionSummary(BaseModel):
    # Para listar sin traer todos los resultados.
    id: int
    name: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True