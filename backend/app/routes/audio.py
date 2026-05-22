from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Device, AudioTest
from app.schemas import DeviceCreate, AudioTestCreate

router = APIRouter(prefix="/audio", tags=["Audio"])

@router.post("/device")
def create_device(device: DeviceCreate, user_id: int, db: Session = Depends(get_db)):
    new_device = Device(
        name=device.name,
        device_type=device.device_type,
        user_id=user_id
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)
    return new_device

@router.post("/test")
def create_test(test: AudioTestCreate, db: Session = Depends(get_db)):
    new_test = AudioTest(
        device_id=test.device_id,
        frequency=test.frequency,
        volume=test.volume,
        user_response=test.user_response
    )
    db.add(new_test)
    db.commit()
    db.refresh(new_test)
    return new_test

@router.get("/results/{device_id}")
def get_results(device_id: int, db: Session = Depends(get_db)):
    tests = db.query(AudioTest).filter(AudioTest.device_id == device_id).all()
    return tests