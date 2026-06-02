from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserResponse
import bcrypt
import jwt
import os

router = APIRouter(prefix="/auth", tags=["Autenticación"])

SECRET_KEY = os.getenv("SECRET_KEY", "mi-clave-secreta")

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: int) -> str:
    return jwt.encode({"user_id": user_id}, SECRET_KEY, algorithm="HS256")

def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """Lee el token 'Bearer <jwt>' del header Authorization y devuelve el User.

    Es la pieza que faltaba para saber DE QUIÉN es cada test sin confiar en un
    user_id suelto. Las rutas que la usan quedan protegidas automáticamente.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Falta el token de autenticación")
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = db.query(User).filter(User.id == payload.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya registrado")

    new_user = User(
        email=user.email,
        password=hash_password(user.password),
        name=user.name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login")
def login(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_token(db_user.id)
    return {"token": token, "user": {"id": db_user.id, "name": db_user.name}}