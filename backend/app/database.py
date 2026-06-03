from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")#viene del archivo .env, que no se sube al repo por seguridad. En desarrollo puede ser algo como postgresql://postgres:password@localhost:5432/mydb, y en producción algo como postgresql://user:pass@host:port/dbname, dependiendo de tu proveedor de hosting.

engine = create_engine(#el cable fisico a la base de datos. SQLAlchemy lo maneja todo, solo le digo la URL y listo.
    DATABASE_URL,
    connect_args={"client_encoding": "utf8", "options": "-c lc_messages=en_US.UTF-8"},
)
SessionLocal = sessionmaker(bind=engine)#fabrica de sesiones, que son como las "conexiones" a la base de datos. Cada vez que quiero hacer algo con la base, creo una sesión, hago mis consultas, y luego cierro la sesión para liberar recursos.
Base = declarative_base()#de aqui ereda los modelos de datos (User, Device, AudioTest, TestSession). Es como decir "todos mis modelos van a ser tablas en la base de datos, y esta es la base para eso".

def get_db():
    db = SessionLocal()
    try:
        yield db#presta la sesión a quien la necesite (normalmente las rutas de FastAPI), y luego se asegura de cerrarla al terminar, incluso si hay errores. Es una forma elegante de manejar la conexión a la base de datos sin tener que preocuparse por cerrar conexiones manualmente.
    finally:
        db.close()#siempre la sesión se cierra al terminar, para evitar fugas de conexiones a la base de datos.