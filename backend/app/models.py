from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    name = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    devices = relationship("Device", back_populates="owner")
    test_sessions = relationship("TestSession", back_populates="owner", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    device_type = Column(String)  # audifonos, parlante, etc
    user_id = Column(Integer, ForeignKey("users.id"))

    owner = relationship("User", back_populates="devices")
    tests = relationship("AudioTest", back_populates="device")

class AudioTest(Base):
    __tablename__ = "audio_tests"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"))
    frequency = Column(Float)
    volume = Column(Float)
    user_response = Column(Integer)  # 1-5 que tan claro escucha
    created_at = Column(DateTime, default=datetime.utcnow)

    device = relationship("Device", back_populates="tests")

class TestSession(Base):
    __tablename__ = "test_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    name = Column(String)             # nombre libre que pone el usuario
    results = Column(JSON)            # lista de bandas: [{"hz":40,"score":7,...}, ...] ,esto srive para que el usuario pueda nombrar su sesión de prueba y guardarla con sus resultados, para luego pedirle a la IA un EQ recomendado basado en esos resultados.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="test_sessions")