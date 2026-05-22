from pydantic import BaseModel
from typing import Optional

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