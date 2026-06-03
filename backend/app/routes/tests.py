"""
Rutas de las sesiones de prueba (tests nombrados por el usuario).

Todo cuelga del usuario autenticado (get_current_user lee el token JWT), así
que cada quien solo ve y toca SUS tests. Operaciones:
  POST   /tests        crear un test nuevo (nombre + resultados)
  GET    /tests        listar los tests del usuario (resumen, sin resultados)
  GET    /tests/{id}   ver un test completo (con resultados)
  PUT    /tests/{id}   modificar: renombrar y/o sobrescribir resultados
  DELETE /tests/{id}   borrar
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import TestSession, User
from app.routes.auth import get_current_user
from app.services.inference_service import test_to_eq
from app.schemas import (
    TestSessionCreate,
    TestSessionUpdate,
    TestSessionResponse,
    TestSessionSummary,
)

router = APIRouter(prefix="/tests", tags=["Tests"])

""" Identificate identificate en esta monda ,quiern eres ,  perro hpta , que no te tengo aqui anotado en mi celular """
def _get_owned(test_id: int, user: User, db: Session) -> TestSession:
    """Busca el test y verifica que sea del usuario; si no, 404."""
    test = db.query(TestSession).filter(TestSession.id == test_id).first()
    if not test or test.user_id != user.id:
        raise HTTPException(status_code=404, detail="Test no encontrado")
    return test


@router.post("", response_model=TestSessionResponse)
def create_test(
    payload: TestSessionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test = TestSession(user_id=user.id, name=payload.name, results=payload.results)
    db.add(test)
    db.commit()
    db.refresh(test)
    return test


@router.get("", response_model=List[TestSessionSummary])
def list_tests(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(TestSession)
        .filter(TestSession.user_id == user.id)
        .order_by(TestSession.updated_at.desc())
        .all()
    )


@router.get("/{test_id}", response_model=TestSessionResponse)
def get_test(
    test_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_owned(test_id, user, db)


@router.put("/{test_id}", response_model=TestSessionResponse)
def update_test(
    test_id: int,
    payload: TestSessionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test = _get_owned(test_id, user, db)
    if payload.name is not None:
        test.name = payload.name
    if payload.results is not None:
        test.results = payload.results
    db.commit()
    db.refresh(test)
    return test


@router.delete("/{test_id}")
def delete_test(
    test_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test = _get_owned(test_id, user, db)
    db.delete(test)
    db.commit()
    return {"ok": True}


@router.get("/{test_id}/eq")
def get_eq(
    test_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """IA 2: a partir del test guardado, devuelve las 9 ganancias del EQ."""
    test = _get_owned(test_id, user, db)# busca el test por id y verifica que sea del usuario autenticado; si no, lanza un 404.
    return test_to_eq(test.results)# <-- aqui entra la magia: convierte la claridad del test (0-10) a una curva de frecuencias, luego la IA predice los filtros biquad, y finalmente se traducen a las ganancias del EQ para el frontend. Todo esto en un solo paso, gracias a la función test_to_eq.
