from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
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